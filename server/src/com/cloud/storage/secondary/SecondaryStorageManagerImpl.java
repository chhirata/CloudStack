/**
 *  Copyright (C) 2010 Cloud.com, Inc.  All rights reserved.
 * 
 * This software is licensed under the GNU General Public License v3 or later.
 * 
 * It is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 */
package com.cloud.storage.secondary;

import java.util.ArrayList;
import java.util.Date;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.ejb.Local;
import javax.naming.ConfigurationException;

import org.apache.log4j.Logger;

import com.cloud.agent.AgentManager;
import com.cloud.agent.api.Answer;
import com.cloud.agent.api.Command;
import com.cloud.agent.api.RebootCommand;
import com.cloud.agent.api.SecStorageFirewallCfgCommand;
import com.cloud.agent.api.SecStorageSetupCommand;
import com.cloud.agent.api.StartupCommand;
import com.cloud.agent.api.StopAnswer;
import com.cloud.agent.api.check.CheckSshAnswer;
import com.cloud.agent.api.check.CheckSshCommand;
import com.cloud.agent.manager.Commands;
import com.cloud.cluster.ClusterManager;
import com.cloud.configuration.Config;
import com.cloud.configuration.dao.ConfigurationDao;
import com.cloud.dc.DataCenter;
import com.cloud.dc.DataCenter.NetworkType;
import com.cloud.dc.DataCenterVO;
import com.cloud.dc.dao.DataCenterDao;
import com.cloud.deploy.DataCenterDeployment;
import com.cloud.deploy.DeployDestination;
import com.cloud.exception.ConcurrentOperationException;
import com.cloud.exception.InsufficientCapacityException;
import com.cloud.exception.ResourceUnavailableException;
import com.cloud.exception.StorageUnavailableException;
import com.cloud.host.Host;
import com.cloud.host.HostVO;
import com.cloud.host.dao.HostDao;
import com.cloud.hypervisor.Hypervisor.HypervisorType;
import com.cloud.info.RunningHostCountInfo;
import com.cloud.info.RunningHostInfoAgregator;
import com.cloud.info.RunningHostInfoAgregator.ZoneHostInfo;
import com.cloud.network.NetworkManager;
import com.cloud.network.NetworkVO;
import com.cloud.network.Networks.TrafficType;
import com.cloud.offerings.NetworkOfferingVO;
import com.cloud.service.ServiceOfferingVO;
import com.cloud.service.dao.ServiceOfferingDao;
import com.cloud.storage.VMTemplateHostVO;
import com.cloud.storage.VMTemplateStorageResourceAssoc.Status;
import com.cloud.storage.VMTemplateVO;
import com.cloud.storage.dao.StoragePoolHostDao;
import com.cloud.storage.dao.VMTemplateDao;
import com.cloud.storage.dao.VMTemplateHostDao;
import com.cloud.storage.template.TemplateConstants;
import com.cloud.user.Account;
import com.cloud.user.AccountService;
import com.cloud.user.User;
import com.cloud.utils.DateUtil;
import com.cloud.utils.NumbersUtil;
import com.cloud.utils.Pair;
import com.cloud.utils.component.Adapters;
import com.cloud.utils.component.ComponentLocator;
import com.cloud.utils.component.Inject;
import com.cloud.utils.db.GlobalLock;
import com.cloud.utils.events.SubscriptionMgr;
import com.cloud.utils.exception.CloudRuntimeException;
import com.cloud.utils.net.NetUtils;
import com.cloud.utils.net.NfsUtils;
import com.cloud.vm.Nic;
import com.cloud.vm.NicProfile;
import com.cloud.vm.ReservationContext;
import com.cloud.vm.SecondaryStorageVm;
import com.cloud.vm.SecondaryStorageVmVO;
import com.cloud.vm.SystemVmLoadScanHandler;
import com.cloud.vm.SystemVmLoadScanner;
import com.cloud.vm.SystemVmLoadScanner.AfterScanAction;
import com.cloud.vm.VirtualMachine;
import com.cloud.vm.VirtualMachine.State;
import com.cloud.vm.VirtualMachineGuru;
import com.cloud.vm.VirtualMachineManager;
import com.cloud.vm.VirtualMachineName;
import com.cloud.vm.VirtualMachineProfile;
import com.cloud.vm.dao.SecondaryStorageVmDao;

//
// Possible secondary storage vm state transition cases
//		Creating -> Destroyed
//		Creating -> Stopped --> Starting -> Running
//		HA -> Stopped -> Starting -> Running
//		Migrating -> Running	(if previous state is Running before it enters into Migrating state
//		Migrating -> Stopped	(if previous state is not Running before it enters into Migrating state)
//		Running -> HA			(if agent lost connection)
//		Stopped -> Destroyed
//
//		Creating state indicates of record creating and IP address allocation are ready, it is a transient
// 		state which will soon be switching towards Running if everything goes well.
//		Stopped state indicates the readiness of being able to start (has storage and IP resources allocated)
//		Starting state can only be entered from Stopped states
//
// Starting, HA, Migrating, Creating and Running state are all counted as "Open" for available capacity calculation
// because sooner or later, it will be driven into Running state
//
@Local(value = { SecondaryStorageVmManager.class })
public class SecondaryStorageManagerImpl implements SecondaryStorageVmManager, VirtualMachineGuru<SecondaryStorageVmVO>, SystemVmLoadScanHandler<Long> {
    private static final Logger s_logger = Logger.getLogger(SecondaryStorageManagerImpl.class);

    private static final int DEFAULT_CAPACITY_SCAN_INTERVAL = 30000; // 30
                                                                     // seconds
    private static final int ACQUIRE_GLOBAL_LOCK_TIMEOUT_FOR_SYNC = 180; // 3
                                                                         // minutes

    private static final int STARTUP_DELAY = 60000; // 60 seconds

    private String _mgmt_host;
    private int _mgmt_port = 8250;

    private String _name;
    @Inject(adapter = SecondaryStorageVmAllocator.class)
    private Adapters<SecondaryStorageVmAllocator> _ssVmAllocators;

    @Inject
    protected SecondaryStorageVmDao _secStorageVmDao;
    @Inject
    private DataCenterDao _dcDao;
    @Inject
    private VMTemplateDao _templateDao;
    @Inject
    private HostDao _hostDao;
    @Inject
    private StoragePoolHostDao _storagePoolHostDao;

    @Inject
    private VMTemplateHostDao _vmTemplateHostDao;

    @Inject
    private AgentManager _agentMgr;
    @Inject
    private NetworkManager _networkMgr;

    @Inject
    private ClusterManager _clusterMgr;

    private SecondaryStorageListener _listener;

    private ServiceOfferingVO _serviceOffering;

    @Inject
    protected ConfigurationDao _configDao;
    @Inject
    private ServiceOfferingDao _offeringDao;
    @Inject
    private AccountService _accountMgr;
    @Inject
    private VirtualMachineManager _itMgr;

    private long _capacityScanInterval = DEFAULT_CAPACITY_SCAN_INTERVAL;

    private int _secStorageVmRamSize;
    private int _secStorageVmCpuMHz;

    private String _instance;
    private boolean _useLocalStorage;
    private boolean _useSSlCopy;
    private String _allowedInternalSites;

    private SystemVmLoadScanner<Long> _loadScanner;
    private Map<Long, ZoneHostInfo> _zoneHostInfoMap;					// map <zone id, info about running host in zone>
    
    private final GlobalLock _allocLock = GlobalLock.getInternLock(getAllocLockName());

    @Override
    public SecondaryStorageVmVO startSecStorageVm(long secStorageVmId) {
        try {
            SecondaryStorageVmVO secStorageVm = _secStorageVmDao.findById(secStorageVmId);
            Account systemAcct = _accountMgr.getSystemAccount();
            User systemUser = _accountMgr.getSystemUser();
            return _itMgr.start(secStorageVm, null, systemUser, systemAcct);
        } catch (StorageUnavailableException e) {
            s_logger.warn("Exception while trying to start secondary storage vm", e);
            return null;
        } catch (InsufficientCapacityException e) {
            s_logger.warn("Exception while trying to start secondary storage vm", e);
            return null;
        } catch (ResourceUnavailableException e) {
            s_logger.warn("Exception while trying to start secondary storage vm", e);
            return null;
        } catch (Exception e) {
            s_logger.warn("Exception while trying to start secondary storage vm", e);
            return null;
        }
    }

    @Override
    public boolean generateFirewallConfiguration(Long hostId) {
        if (hostId == null) {
            return true;
        }
        boolean success = true;
        List<DataCenterVO> allZones = _dcDao.listAll();
        for (DataCenterVO zone : allZones) {
            success = success && generateFirewallConfigurationForZone(zone.getId());
        }
        return true;
    }

    @Override
    public boolean generateSetupCommand(Long zoneId) {

        List<SecondaryStorageVmVO> zoneSsvms = _secStorageVmDao.listByZoneId(SecondaryStorageVm.Role.templateProcessor, zoneId);
        if (zoneSsvms.size() == 0) {
            return true;
        }
        SecondaryStorageVmVO secStorageVm = zoneSsvms.get(0);// FIXME: assumes
                                                             // one vm per zone.
        if (secStorageVm.getState() != State.Running && secStorageVm.getState() != State.Starting) {
            s_logger.warn("No running secondary storage vms found in zone " + zoneId + " , skip programming http auth");
            return true;
        }
        Host storageHost = _hostDao.findSecondaryStorageHost(zoneId);
        if (storageHost == null) {
            s_logger.warn("No storage hosts found in zone " + zoneId + " , skip programming http auth");
            return true;
        }
        SecStorageSetupCommand setupCmd = new SecStorageSetupCommand(zoneId);
        if (_allowedInternalSites != null) {
            List<String> allowedCidrs = new ArrayList<String>();
            String[] cidrs = _allowedInternalSites.split(",");
            for (String cidr : cidrs) {
                if (NetUtils.isValidCIDR(cidr) || NetUtils.isValidIp(cidr)) {
                    allowedCidrs.add(cidr);
                }
            }
            Nic privateNic = _networkMgr.getNicForTraffic(secStorageVm.getId(), TrafficType.Management);
            String privateCidr = NetUtils.ipAndNetMaskToCidr(privateNic.getIp4Address(), privateNic.getNetmask());
            String publicCidr = NetUtils.ipAndNetMaskToCidr(secStorageVm.getPublicIpAddress(), secStorageVm.getPublicNetmask());
            if (NetUtils.isNetworkAWithinNetworkB(privateCidr, publicCidr) || NetUtils.isNetworkAWithinNetworkB(publicCidr, privateCidr)) {
            	s_logger.info("private and public interface overlaps, add a default route through private interface. privateCidr: " + privateCidr + ", publicCidr: " + publicCidr);
                allowedCidrs.add("0.0.0.0/0");
            }
            setupCmd.setAllowedInternalSites(allowedCidrs.toArray(new String[allowedCidrs.size()]));
        }
        String copyPasswd = _configDao.getValue("secstorage.copy.password");
        setupCmd.setCopyPassword(copyPasswd);
        setupCmd.setCopyUserName(TemplateConstants.DEFAULT_HTTP_AUTH_USER);
        Answer answer = _agentMgr.easySend(storageHost.getId(), setupCmd);
        if (answer != null && answer.getResult()) {
            if (s_logger.isDebugEnabled()) {
                s_logger.debug("Successfully programmed http auth into " + secStorageVm.getName());
            }
            return true;
        } else {
            if (s_logger.isDebugEnabled()) {
                s_logger.debug("failed to program http auth into secondary storage vm : " + secStorageVm.getName());
            }
            return false;
        }
    }

    @Override
	public Pair<HostVO, SecondaryStorageVmVO> assignSecStorageVm(long zoneId, Command cmd) {
		return null;
	}

    private boolean generateFirewallConfigurationForZone(Long zoneId) {
        List<SecondaryStorageVmVO> zoneSsvms = _secStorageVmDao.listByZoneId(SecondaryStorageVm.Role.templateProcessor, zoneId);
        if (zoneSsvms.size() == 0) {
            return true;
        }
        SecondaryStorageVmVO secStorageVm = zoneSsvms.get(0);// FIXME: assumes
                                                             // one vm per zone.
        if (secStorageVm.getState() != State.Running && secStorageVm.getState() != State.Starting) {
            s_logger.warn("No running secondary storage vms found in zone " + zoneId + " , skip programming firewall rules");
            return true;
        }
        Host storageHost = _hostDao.findSecondaryStorageHost(zoneId);
        if (storageHost == null) {
            s_logger.warn("No storage hosts found in zone " + zoneId + " , skip programming firewall rules");
            return true;
        }
        List<SecondaryStorageVmVO> alreadyRunning = _secStorageVmDao.getSecStorageVmListInStates(SecondaryStorageVm.Role.templateProcessor, State.Running, State.Migrating, State.Starting);

        String copyPort = Integer.toString(TemplateConstants.DEFAULT_TMPLT_COPY_PORT);
        SecStorageFirewallCfgCommand cpc = new SecStorageFirewallCfgCommand();
        for (SecondaryStorageVmVO ssVm : alreadyRunning) {
            if (ssVm.getPublicIpAddress() != null) {
                if (ssVm.getId() == secStorageVm.getId()) {
                    continue;
                }
                cpc.addPortConfig(ssVm.getPublicIpAddress(), copyPort, true, TemplateConstants.DEFAULT_TMPLT_COPY_INTF);
                if (_useSSlCopy) {
                    cpc.addPortConfig(ssVm.getPublicIpAddress(), "443", true, TemplateConstants.DEFAULT_TMPLT_COPY_INTF);
                }
            }
        }
        Answer answer = _agentMgr.easySend(storageHost.getId(), cpc);
        if (answer != null && answer.getResult()) {
            if (s_logger.isDebugEnabled()) {
                s_logger.debug("Successfully programmed firewall rules into " + secStorageVm.getName());
            }
            return true;
        } else {
            if (s_logger.isDebugEnabled()) {
                s_logger.debug("failed to program firewall rules into secondary storage vm : " + secStorageVm.getName());
            }
            return false;
        }

    }

    public SecondaryStorageVmVO startNew(long dataCenterId, SecondaryStorageVm.Role role) {

        if (s_logger.isDebugEnabled()) {
            s_logger.debug("Assign secondary storage vm from a newly started instance for request from data center : " + dataCenterId);
        }

        Map<String, Object> context = createSecStorageVmInstance(dataCenterId, role);

        long secStorageVmId = (Long) context.get("secStorageVmId");
        if (secStorageVmId == 0) {
            if (s_logger.isTraceEnabled()) {
                s_logger.trace("Creating secondary storage vm instance failed, data center id : " + dataCenterId);
            }

            return null;
        }

        SecondaryStorageVmVO secStorageVm = _secStorageVmDao.findById(secStorageVmId);
        // SecondaryStorageVmVO secStorageVm =
        // allocSecStorageVmStorage(dataCenterId, secStorageVmId);
        if (secStorageVm != null) {
            SubscriptionMgr.getInstance().notifySubscribers(ALERT_SUBJECT, this,
                    new SecStorageVmAlertEventArgs(SecStorageVmAlertEventArgs.SSVM_CREATED, dataCenterId, secStorageVmId, secStorageVm, null));
            return secStorageVm;
        } else {
            if (s_logger.isDebugEnabled()) {
                s_logger.debug("Unable to allocate secondary storage vm storage, remove the secondary storage vm record from DB, secondary storage vm id: "
                        + secStorageVmId);
            }

            SubscriptionMgr.getInstance().notifySubscribers(
                    ALERT_SUBJECT,
                    this,
                    new SecStorageVmAlertEventArgs(SecStorageVmAlertEventArgs.SSVM_CREATE_FAILURE, dataCenterId, secStorageVmId, null,
                            "Unable to allocate storage"));
        }
        return null;
    }

    protected Map<String, Object> createSecStorageVmInstance(long dataCenterId, SecondaryStorageVm.Role role) {
        HostVO secHost = _hostDao.findSecondaryStorageHost(dataCenterId);
        if (secHost == null) {
            String msg = "No secondary storage available in zone " + dataCenterId + ", cannot create secondary storage vm";
            s_logger.warn(msg);
            throw new CloudRuntimeException(msg);
        }

        long id = _secStorageVmDao.getNextInSequence(Long.class, "id");
        String name = VirtualMachineName.getSystemVmName(id, _instance, "s").intern();
        Account systemAcct = _accountMgr.getSystemAccount();

        DataCenterDeployment plan = new DataCenterDeployment(dataCenterId);
        DataCenter dc = _dcDao.findById(plan.getDataCenterId());

        List<NetworkOfferingVO> defaultOffering = _networkMgr.getSystemAccountNetworkOfferings(NetworkOfferingVO.SystemPublicNetwork);
        
        if (dc.getNetworkType() == NetworkType.Basic || dc.isSecurityGroupEnabled()) {
            defaultOffering = _networkMgr.getSystemAccountNetworkOfferings(NetworkOfferingVO.SystemGuestNetwork);
        }

        List<NetworkOfferingVO> offerings = _networkMgr.getSystemAccountNetworkOfferings(NetworkOfferingVO.SystemControlNetwork,
                NetworkOfferingVO.SystemManagementNetwork);
        List<Pair<NetworkVO, NicProfile>> networks = new ArrayList<Pair<NetworkVO, NicProfile>>(offerings.size() + 1);
        NicProfile defaultNic = new NicProfile();
        defaultNic.setDefaultNic(true);
        defaultNic.setDeviceId(2);
        try {
            networks.add(new Pair<NetworkVO, NicProfile>(_networkMgr.setupNetwork(systemAcct, defaultOffering.get(0), plan, null, null, false, false)
                    .get(0), defaultNic));
            for (NetworkOfferingVO offering : offerings) {
                networks.add(new Pair<NetworkVO, NicProfile>(_networkMgr.setupNetwork(systemAcct, offering, plan, null, null, false, false).get(0),
                        null));
            }
        } catch (ConcurrentOperationException e) {
            s_logger.info("Unable to setup due to concurrent operation. " + e);
            return new HashMap<String, Object>();
        }
        
        VMTemplateVO template = _templateDao.findSystemVMTemplate(dataCenterId);
        if (template == null) {
            s_logger.debug("Can't find a template to start");
            throw new CloudRuntimeException("Insufficient capacity exception");
        }
        
        SecondaryStorageVmVO secStorageVm = new SecondaryStorageVmVO(id, _serviceOffering.getId(), name, template.getId(),
                template.getHypervisorType(), template.getGuestOSId(), dataCenterId, systemAcct.getDomainId(), systemAcct.getId(), role);
        try {
            secStorageVm = _itMgr.allocate(secStorageVm, template, _serviceOffering, networks, plan, null, systemAcct);
        } catch (InsufficientCapacityException e) {
            s_logger.warn("InsufficientCapacity", e);
            throw new CloudRuntimeException("Insufficient capacity exception", e);
        }

        Map<String, Object> context = new HashMap<String, Object>();
        context.put("secStorageVmId", secStorageVm.getId());
        return context;
    }

    private SecondaryStorageVmAllocator getCurrentAllocator() {

        // for now, only one adapter is supported
        Enumeration<SecondaryStorageVmAllocator> it = _ssVmAllocators.enumeration();
        if (it.hasMoreElements()) {
            return it.nextElement();
        }

        return null;
    }

    protected String connect(String ipAddress, int port) {
        return null;
    }

    public SecondaryStorageVmVO assignSecStorageVmFromRunningPool(long dataCenterId, SecondaryStorageVm.Role role) {

        if (s_logger.isTraceEnabled()) {
            s_logger.trace("Assign  secondary storage vm from running pool for request from data center : " + dataCenterId);
        }

        SecondaryStorageVmAllocator allocator = getCurrentAllocator();
        assert (allocator != null);
        List<SecondaryStorageVmVO> runningList = _secStorageVmDao.getSecStorageVmListInStates(role, dataCenterId, State.Running);
        if (runningList != null && runningList.size() > 0) {
            if (s_logger.isTraceEnabled()) {
                s_logger.trace("Running secondary storage vm pool size : " + runningList.size());
                for (SecondaryStorageVmVO secStorageVm : runningList) {
                    s_logger.trace("Running secStorageVm instance : " + secStorageVm.getName());
                }
            }

            Map<Long, Integer> loadInfo = new HashMap<Long, Integer>();

            return allocator.allocSecondaryStorageVm(runningList, loadInfo, dataCenterId);
        } else {
            if (s_logger.isTraceEnabled()) {
                s_logger.trace("Empty running secStorageVm pool for now in data center : " + dataCenterId);
            }
        }
        return null;
    }

    public SecondaryStorageVmVO assignSecStorageVmFromStoppedPool(long dataCenterId, SecondaryStorageVm.Role role) {
        List<SecondaryStorageVmVO> l = _secStorageVmDao.getSecStorageVmListInStates(role, dataCenterId, State.Starting, State.Stopped, State.Migrating);
        if (l != null && l.size() > 0) {
            return l.get(0);
        }

        return null;
    }

    private void allocCapacity(long dataCenterId, SecondaryStorageVm.Role role) {
        if (s_logger.isTraceEnabled()) {
            s_logger.trace("Allocate secondary storage vm standby capacity for data center : " + dataCenterId);
        }

        boolean secStorageVmFromStoppedPool = false;
        SecondaryStorageVmVO secStorageVm = assignSecStorageVmFromStoppedPool(dataCenterId, role);
        if (secStorageVm == null) {
            if (s_logger.isInfoEnabled()) {
                s_logger.info("No stopped secondary storage vm is available, need to allocate a new secondary storage vm");
            }

            if (_allocLock.lock(ACQUIRE_GLOBAL_LOCK_TIMEOUT_FOR_SYNC)) {
                try {
                    secStorageVm = startNew(dataCenterId, role);
                } finally {
                    _allocLock.unlock();
                }
            } else {
                if (s_logger.isInfoEnabled()) {
                    s_logger.info("Unable to acquire synchronization lock to allocate secStorageVm resource for standby capacity, wait for next scan");
                }
                return;
            }
        } else {
            if (s_logger.isInfoEnabled()) {
                s_logger.info("Found a stopped secondary storage vm, bring it up to running pool. secStorageVm vm id : " + secStorageVm.getId());
            }
            secStorageVmFromStoppedPool = true;
        }

        if (secStorageVm != null) {
            long secStorageVmId = secStorageVm.getId();
            GlobalLock secStorageVmLock = GlobalLock.getInternLock(getSecStorageVmLockName(secStorageVmId));
            try {
                if (secStorageVmLock.lock(ACQUIRE_GLOBAL_LOCK_TIMEOUT_FOR_SYNC)) {
                    try {
                        secStorageVm = startSecStorageVm(secStorageVmId);
                    } finally {
                        secStorageVmLock.unlock();
                    }
                } else {
                    if (s_logger.isInfoEnabled()) {
                        s_logger.info("Unable to acquire synchronization lock to start secStorageVm for standby capacity, secStorageVm vm id : "
                                + secStorageVm.getId());
                    }
                    return;
                }
            } finally {
                secStorageVmLock.releaseRef();
            }

            if (secStorageVm == null) {
                if (s_logger.isInfoEnabled()) {
                    s_logger.info("Unable to start secondary storage vm for standby capacity, secStorageVm vm Id : " + secStorageVmId
                            + ", will recycle it and start a new one");
                }

                if (secStorageVmFromStoppedPool) {
                    destroySecStorageVm(secStorageVmId);
                }
            } else {
                if (s_logger.isInfoEnabled()) {
                    s_logger.info("Secondary storage vm " + secStorageVm.getName() + " is started");
                }
            }
        }
    }

    public boolean isZoneReady(Map<Long, ZoneHostInfo> zoneHostInfoMap, long dataCenterId) {
        ZoneHostInfo zoneHostInfo = zoneHostInfoMap.get(dataCenterId);
        if (zoneHostInfo != null && (zoneHostInfo.getFlags() & RunningHostInfoAgregator.ZoneHostInfo.ROUTING_HOST_MASK) != 0) {
            VMTemplateVO template = _templateDao.findSystemVMTemplate(dataCenterId);
            HostVO secHost = _hostDao.findSecondaryStorageHost(dataCenterId);
            if (secHost == null) {
                if (s_logger.isDebugEnabled()) {
                    s_logger.debug("No secondary storage available in zone " + dataCenterId
                            + ", wait until it is ready to launch secondary storage vm");
                }
                return false;
            }

            boolean templateReady = false;
            if (template != null) {
                VMTemplateHostVO templateHostRef = _vmTemplateHostDao.findByHostTemplate(secHost.getId(), template.getId());
                templateReady = (templateHostRef != null) && (templateHostRef.getDownloadState() == Status.DOWNLOADED);
            }

            if (templateReady) {

                List<Pair<Long, Integer>> l = _storagePoolHostDao.getDatacenterStoragePoolHostInfo(dataCenterId, !_useLocalStorage);
                if (l != null && l.size() > 0 && l.get(0).second().intValue() > 0) {

                    return true;
                } else {
                    if (s_logger.isDebugEnabled()) {
                        s_logger.debug("Primary storage is not ready, wait until it is ready to launch secondary storage vm");
                    }
                }
            } else {
                if (s_logger.isTraceEnabled()) {
                    s_logger.trace("Zone host is ready, but secondary storage vm template is not ready");
                }
            }
        }
        return false;
    }

    private synchronized Map<Long, ZoneHostInfo> getZoneHostInfo() {
        Date cutTime = DateUtil.currentGMTTime();
        List<RunningHostCountInfo> l = _hostDao.getRunningHostCounts(new Date(cutTime.getTime() - _clusterMgr.getHeartbeatThreshold()));

        RunningHostInfoAgregator aggregator = new RunningHostInfoAgregator();
        if (l.size() > 0) {
            for (RunningHostCountInfo countInfo : l) {
                aggregator.aggregate(countInfo);
            }
        }

        return aggregator.getZoneHostInfoMap();
    }

    @Override
    public String getName() {
        return _name;
    }

    @Override
    public boolean start() {
        if (s_logger.isInfoEnabled()) {
            s_logger.info("Start secondary storage vm manager");
        }

        return true;
    }

    @Override
    public boolean stop() {
    	_loadScanner.stop();
        _allocLock.releaseRef();
        return true;
    }

    @Override
    public boolean configure(String name, Map<String, Object> params) throws ConfigurationException {
        if (s_logger.isInfoEnabled()) {
            s_logger.info("Start configuring secondary storage vm manager : " + name);
        }

        _name = name;

        ComponentLocator locator = ComponentLocator.getCurrentLocator();
        ConfigurationDao configDao = locator.getDao(ConfigurationDao.class);
        if (configDao == null) {
            throw new ConfigurationException("Unable to get the configuration dao.");
        }

        Map<String, String> configs = configDao.getConfiguration("management-server", params);

        _secStorageVmRamSize = NumbersUtil.parseInt(configs.get("secstorage.vm.ram.size"), DEFAULT_SS_VM_RAMSIZE);
        _secStorageVmCpuMHz = NumbersUtil.parseInt(configs.get("secstorage.vm.cpu.mhz"), DEFAULT_SS_VM_CPUMHZ);
        String useServiceVM = configDao.getValue("secondary.storage.vm");
        boolean _useServiceVM = false;
        if ("true".equalsIgnoreCase(useServiceVM)) {
            _useServiceVM = true;
        }

        String sslcopy = configDao.getValue("secstorage.encrypt.copy");
        if ("true".equalsIgnoreCase(sslcopy)) {
            _useSSlCopy = true;
        }

        _allowedInternalSites = configDao.getValue("secstorage.allowed.internal.sites");

        String value = configs.get("secstorage.capacityscan.interval");
        _capacityScanInterval = NumbersUtil.parseLong(value, DEFAULT_CAPACITY_SCAN_INTERVAL);

        _instance = configs.get("instance.name");
        if (_instance == null) {
            _instance = "DEFAULT";
        }

        Map<String, String> agentMgrConfigs = configDao.getConfiguration("AgentManager", params);
        _mgmt_host = agentMgrConfigs.get("host");
        if (_mgmt_host == null) {
            s_logger.warn("Critical warning! Please configure your management server host address right after you have started your management server and then restart it, otherwise you won't have access to secondary storage");
        }

        value = agentMgrConfigs.get("port");
        _mgmt_port = NumbersUtil.parseInt(value, 8250);

        _listener = new SecondaryStorageListener(this);
        _agentMgr.registerForHostEvents(_listener, true, true, false);

        _itMgr.registerGuru(VirtualMachine.Type.SecondaryStorageVm, this);

        _useLocalStorage = Boolean.parseBoolean(configs.get(Config.SystemVMUseLocalStorage.key()));
        _serviceOffering = new ServiceOfferingVO("System Offering For Secondary Storage VM", 1, _secStorageVmRamSize, _secStorageVmCpuMHz, null, null, true, null, _useLocalStorage, true, null, true);
        _serviceOffering.setUniqueName("Cloud.com-SecondaryStorage");
        _serviceOffering = _offeringDao.persistSystemServiceOffering(_serviceOffering);

        if (_useServiceVM) {
            _loadScanner = new SystemVmLoadScanner<Long>(this);
            _loadScanner.initScan(STARTUP_DELAY, _capacityScanInterval);
        }
        if (s_logger.isInfoEnabled()) {
            s_logger.info("Secondary storage vm Manager is configured.");
        }
        return true;
    }

    protected SecondaryStorageManagerImpl() {
    }

    @Override
    public Long convertToId(String vmName) {
        if (!VirtualMachineName.isValidSystemVmName(vmName, _instance, "s")) {
            return null;
        }
        return VirtualMachineName.getSystemVmId(vmName);
    }

    @Override
    public boolean stopSecStorageVm(long secStorageVmId) {
        SecondaryStorageVmVO secStorageVm = _secStorageVmDao.findById(secStorageVmId);
        if (secStorageVm == null) {
            String msg = "Stopping secondary storage vm failed: secondary storage vm " + secStorageVmId + " no longer exists";
            if (s_logger.isDebugEnabled()) {
                s_logger.debug(msg);
            }
            return false;
        }
        try {
            if (secStorageVm.getHostId() != null) {
                GlobalLock secStorageVmLock = GlobalLock.getInternLock(getSecStorageVmLockName(secStorageVm.getId()));
                try {
                    if (secStorageVmLock.lock(ACQUIRE_GLOBAL_LOCK_TIMEOUT_FOR_SYNC)) {
                        try {
                            boolean result = _itMgr.stop(secStorageVm, _accountMgr.getSystemUser(), _accountMgr.getSystemAccount());
                            if (result) {
                            }

                            return result;
                        } finally {
                            secStorageVmLock.unlock();
                        }
                    } else {
                        String msg = "Unable to acquire secondary storage vm lock : " + secStorageVm.toString();
                        s_logger.debug(msg);
                        return false;
                    }
                } finally {
                    secStorageVmLock.releaseRef();
                }
            }

            // vm was already stopped, return true
            return true;
        } catch (ResourceUnavailableException e) {
            if (s_logger.isDebugEnabled()) {
                s_logger.debug("Stopping secondary storage vm " + secStorageVm.getName() + " faled : exception " + e.toString());
            }
            return false;
        }
    }

    @Override
    public boolean rebootSecStorageVm(long secStorageVmId) {
        final SecondaryStorageVmVO secStorageVm = _secStorageVmDao.findById(secStorageVmId);

        if (secStorageVm == null || secStorageVm.getState() == State.Destroyed) {
            return false;
        }

        if (secStorageVm.getState() == State.Running && secStorageVm.getHostId() != null) {
            final RebootCommand cmd = new RebootCommand(secStorageVm.getInstanceName());
            final Answer answer = _agentMgr.easySend(secStorageVm.getHostId(), cmd);

            if (answer != null && answer.getResult()) {
                if (s_logger.isDebugEnabled()) {
                    s_logger.debug("Successfully reboot secondary storage vm " + secStorageVm.getName());
                }

                SubscriptionMgr.getInstance().notifySubscribers(
                        ALERT_SUBJECT,
                        this,
                        new SecStorageVmAlertEventArgs(SecStorageVmAlertEventArgs.SSVM_REBOOTED, secStorageVm.getDataCenterId(),
                                secStorageVm.getId(), secStorageVm, null));

                return true;
            } else {
                String msg = "Rebooting Secondary Storage VM failed - " + secStorageVm.getName();
                if (s_logger.isDebugEnabled()) {
                    s_logger.debug(msg);
                }
                return false;
            }
        } else {
            return startSecStorageVm(secStorageVmId) != null;
        }
    }

    @Override
    public boolean destroySecStorageVm(long vmId) {
        SecondaryStorageVmVO ssvm = _secStorageVmDao.findById(vmId);

        try {
            return _itMgr.expunge(ssvm, _accountMgr.getSystemUser(), _accountMgr.getSystemAccount());
        } catch (ResourceUnavailableException e) {
            s_logger.warn("Unable to expunge " + ssvm, e);
            return false;
        }
    }

    @Override
    public void onAgentConnect(Long dcId, StartupCommand cmd) {
    }

    private String getAllocLockName() {
        // to improve security, it may be better to return a unique mashed
        // name(for example MD5 hashed)
        return "secStorageVm.alloc";
    }

    private String getSecStorageVmLockName(long id) {
        return "secStorageVm." + id;
    }

    @Override
    public SecondaryStorageVmVO findByName(String name) {
        if (!VirtualMachineName.isValidSecStorageVmName(name, null)) {
            return null;
        }
        return findById(VirtualMachineName.getSystemVmId(name));
    }

    @Override
    public SecondaryStorageVmVO findById(long id) {
        return _secStorageVmDao.findById(id);
    }

    @Override
    public SecondaryStorageVmVO persist(SecondaryStorageVmVO vm) {
        return _secStorageVmDao.persist(vm);
    }

    @Override
    public boolean finalizeVirtualMachineProfile(VirtualMachineProfile<SecondaryStorageVmVO> profile, DeployDestination dest,
            ReservationContext context) {

        HostVO secHost = _hostDao.findSecondaryStorageHost(dest.getDataCenter().getId());
        assert (secHost != null);

        StringBuilder buf = profile.getBootArgsBuilder();
        buf.append(" template=domP type=secstorage");
        buf.append(" host=").append(_mgmt_host);
        buf.append(" port=").append(_mgmt_port);
        buf.append(" name=").append(profile.getVirtualMachine().getName());

        buf.append(" zone=").append(dest.getDataCenter().getId());
        buf.append(" pod=").append(dest.getPod().getId());

        if(profile.getVirtualMachine().getRole() == SecondaryStorageVm.Role.templateProcessor)
        	buf.append(" guid=").append(secHost.getGuid());
        else
        	buf.append(" guid=").append(profile.getVirtualMachine().getName());
        
        String nfsMountPoint = null;
        try {
            nfsMountPoint = NfsUtils.url2Mount(secHost.getStorageUrl());
        } catch (Exception e) {
        }

        buf.append(" mount.path=").append(nfsMountPoint);
        if(_configDao.isPremium()) {
            if (profile.getHypervisorType() == HypervisorType.Hyperv) {
            	buf.append(" resource=com.cloud.storage.resource.CifsSecondaryStorageResource");
            } else
            	buf.append(" resource=com.cloud.storage.resource.PremiumSecondaryStorageResource");
        } else	
        	buf.append(" resource=com.cloud.storage.resource.NfsSecondaryStorageResource");
        buf.append(" instance=SecStorage");
        buf.append(" sslcopy=").append(Boolean.toString(_useSSlCopy));
        buf.append(" role=").append(profile.getVirtualMachine().getRole().toString());

        boolean externalDhcp = false;
        String externalDhcpStr = _configDao.getValue("direct.attach.network.externalIpAllocator.enabled");
        if (externalDhcpStr != null && externalDhcpStr.equalsIgnoreCase("true")) {
            externalDhcp = true;
        }

        for (NicProfile nic : profile.getNics()) {
            int deviceId = nic.getDeviceId();
            if (nic.getIp4Address() == null) {
                buf.append(" eth").append(deviceId).append("mask=").append("0.0.0.0");
                buf.append(" eth").append(deviceId).append("ip=").append("0.0.0.0");
            } else {
                buf.append(" eth").append(deviceId).append("ip=").append(nic.getIp4Address());
                buf.append(" eth").append(deviceId).append("mask=").append(nic.getNetmask());
            }

            buf.append(" eth").append(deviceId).append("mask=").append(nic.getNetmask());
            if (nic.isDefaultNic()) {
                buf.append(" gateway=").append(nic.getGateway());
            }
            if (nic.getTrafficType() == TrafficType.Management) {
            	String mgmt_cidr = _configDao.getValue(Config.ManagementNetwork.key());
            	if (NetUtils.isValidCIDR(mgmt_cidr)) {
            	    buf.append(" mgmtcidr=").append(mgmt_cidr);
            	}
            	
                buf.append(" localgw=").append(dest.getPod().getGateway());
                buf.append(" private.network.device=").append("eth").append(deviceId);
            } else if (nic.getTrafficType() == TrafficType.Public) {
                buf.append(" public.network.device=").append("eth").append(deviceId);
            }
        }

        /* External DHCP mode */
        if (externalDhcp) {
            buf.append(" bootproto=dhcp");
        }

        DataCenterVO dc = _dcDao.findById(profile.getVirtualMachine().getDataCenterId());
        buf.append(" dns1=").append(dc.getInternalDns1());
        if (dc.getInternalDns2() != null) {
            buf.append(" dns2=").append(dc.getInternalDns2());
        }

        String bootArgs = buf.toString();
        if (s_logger.isDebugEnabled()) {
            s_logger.debug("Boot Args for " + profile + ": " + bootArgs);
        }

        return true;
    }

    @Override
    public boolean finalizeDeployment(Commands cmds, VirtualMachineProfile<SecondaryStorageVmVO> profile, DeployDestination dest,
            ReservationContext context) {
        
        finalizeCommandsOnStart(cmds, profile);

        SecondaryStorageVmVO secVm = profile.getVirtualMachine();
        DataCenter dc = dest.getDataCenter();
        List<NicProfile> nics = profile.getNics();
        for (NicProfile nic : nics) {
            if ((nic.getTrafficType() == TrafficType.Public && dc.getNetworkType() == NetworkType.Advanced)
                || (nic.getTrafficType() == TrafficType.Guest && (dc.getNetworkType() == NetworkType.Basic || dc.isSecurityGroupEnabled()))) {
                secVm.setPublicIpAddress(nic.getIp4Address());
                secVm.setPublicNetmask(nic.getNetmask());
                secVm.setPublicMacAddress(nic.getMacAddress());
            } else if (nic.getTrafficType() == TrafficType.Management) {
                secVm.setPrivateIpAddress(nic.getIp4Address());
                secVm.setPrivateMacAddress(nic.getMacAddress());
            }
        }
        _secStorageVmDao.update(secVm.getId(), secVm);
        return true;
    }
    
    @Override
    public boolean finalizeCommandsOnStart(Commands cmds, VirtualMachineProfile<SecondaryStorageVmVO> profile) {
        
        NicProfile managementNic = null;
        NicProfile controlNic = null;
        for (NicProfile nic : profile.getNics()) {
           if (nic.getTrafficType() == TrafficType.Management) {
               managementNic = nic;
           } else if (nic.getTrafficType() == TrafficType.Control && nic.getIp4Address() != null) {
               controlNic = nic;
           }
        }

        if (controlNic == null) {
          assert (managementNic != null);
          controlNic = managementNic;
        }

        CheckSshCommand check = new CheckSshCommand(profile.getInstanceName(), controlNic.getIp4Address(), 3922, 5, 20);
        cmds.addCommand("checkSsh", check);
        
        return true;
    }

    @Override
    public boolean finalizeStart(VirtualMachineProfile<SecondaryStorageVmVO> profile, long hostId, Commands cmds, ReservationContext context) {
        CheckSshAnswer answer = (CheckSshAnswer) cmds.getAnswer("checkSsh");
        if (!answer.getResult()) {
            s_logger.warn("Unable to ssh to the VM: " + answer.getDetails());
            return false;
        }

        return true;
    }

    @Override
    public void finalizeStop(VirtualMachineProfile<SecondaryStorageVmVO> profile, StopAnswer answer) {
    }
    
    @Override
    public void finalizeExpunge(SecondaryStorageVmVO vm) {
    }
    
    @Override
	public String getScanHandlerName() {
		return "secstorage";
	}
    
    @Override
	public boolean canScan() {
		return true;
	}

    @Override
	public void onScanStart() {
        _zoneHostInfoMap = getZoneHostInfo();
	}
	
    @Override
	public Long[] getScannablePools() {
		List<DataCenterVO> zones = _dcDao.listEnabledZones();

		Long[] dcIdList = new Long[zones.size()];
		int i = 0;
		for(DataCenterVO dc : zones) {
			dcIdList[i++] = dc.getId();
		}
		
		return dcIdList;
	}
	
    @Override
	public boolean isPoolReadyForScan(Long pool) {
		// pool is at zone basis
		long dataCenterId = pool.longValue();
		
		if(!isZoneReady(_zoneHostInfoMap, dataCenterId)) {
			if(s_logger.isDebugEnabled())
				s_logger.debug("Zone " + dataCenterId + " is not ready to launch secondary storage VM yet");
			return false;
		}

		if(s_logger.isDebugEnabled())
			s_logger.debug("Zone " + dataCenterId + " is ready to launch secondary storage VM");
		return true;
	}
	
    @Override
	public Pair<AfterScanAction, Object> scanPool(Long pool) {
		long dataCenterId = pool.longValue();
    	
        List<SecondaryStorageVmVO> alreadyRunning = _secStorageVmDao.getSecStorageVmListInStates(SecondaryStorageVm.Role.templateProcessor, dataCenterId, State.Running,
                State.Migrating, State.Starting);
        List<SecondaryStorageVmVO> stopped = _secStorageVmDao.getSecStorageVmListInStates(SecondaryStorageVm.Role.templateProcessor, dataCenterId, State.Stopped,
                State.Stopping);
        if (alreadyRunning.size() == 0) {
            if (stopped.size() == 0) {
                s_logger.info("No secondary storage vms found in datacenter id=" + dataCenterId + ", starting a new one");
            	return new Pair<AfterScanAction, Object>(AfterScanAction.expand, SecondaryStorageVm.Role.templateProcessor);
            } else {
                s_logger.warn("Stopped secondary storage vms found in datacenter id=" + dataCenterId
                        + ", not restarting them automatically");
            }
        }
        
        return new Pair<AfterScanAction, Object>(AfterScanAction.nop, SecondaryStorageVm.Role.templateProcessor);
	}
	
    @Override
	public void expandPool(Long pool, Object actionArgs) {
		long dataCenterId = pool.longValue();
        allocCapacity(dataCenterId, (SecondaryStorageVm.Role)actionArgs);
	}
	
    @Override
	public void shrinkPool(Long pool, Object actionArgs) {
	}
	
    @Override
	public void onScanEnd() {
	}
    
}

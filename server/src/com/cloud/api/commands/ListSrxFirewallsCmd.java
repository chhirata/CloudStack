// Copyright 2012 Citrix Systems, Inc. Licensed under the
// Apache License, Version 2.0 (the "License"); you may not use this
// file except in compliance with the License.  Citrix Systems, Inc.
// reserves all rights not expressly granted by the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// 
// Automatically generated by addcopyright.py at 04/03/2012
package com.cloud.api.commands;

import java.util.ArrayList;
import java.util.List;

import org.apache.log4j.Logger;

import com.cloud.api.ApiConstants;
import com.cloud.api.BaseCmd;
import com.cloud.api.BaseListCmd;
import com.cloud.api.IdentityMapper;
import com.cloud.api.Implementation;
import com.cloud.api.Parameter;
import com.cloud.api.PlugService;
import com.cloud.api.ServerApiException;
import com.cloud.api.response.ListResponse;
import com.cloud.api.response.SrxFirewallResponse;
import com.cloud.exception.ConcurrentOperationException;
import com.cloud.exception.InsufficientCapacityException;
import com.cloud.exception.InvalidParameterValueException;
import com.cloud.exception.ResourceAllocationException;
import com.cloud.exception.ResourceUnavailableException;
import com.cloud.network.ExternalFirewallDeviceVO;
import com.cloud.network.element.JuniperSRXFirewallElementService;
import com.cloud.utils.exception.CloudRuntimeException;

@Implementation(responseObject=SrxFirewallResponse.class, description="lists SRX firewall devices in a physical network")
public class ListSrxFirewallsCmd extends BaseListCmd {

    public static final Logger s_logger = Logger.getLogger(ListSrxFirewallsCmd.class.getName());
    private static final String s_name = "listsrxfirewallresponse";
    @PlugService JuniperSRXFirewallElementService _srxFwService;

    /////////////////////////////////////////////////////
    //////////////// API parameters /////////////////////
    /////////////////////////////////////////////////////

    @IdentityMapper(entityTableName="physical_network")
    @Parameter(name=ApiConstants.PHYSICAL_NETWORK_ID, type=CommandType.LONG, description="the Physical Network ID")
    private Long physicalNetworkId;

    @IdentityMapper(entityTableName="external_firewall_devices")
    @Parameter(name=ApiConstants.FIREWALL_DEVICE_ID, type=CommandType.LONG,  description="SRX firewall device ID")
    private Long fwDeviceId;

    /////////////////////////////////////////////////////
    /////////////////// Accessors ///////////////////////
    /////////////////////////////////////////////////////

    public Long getFirewallDeviceId() {
        return fwDeviceId;
    }

    public Long getPhysicalNetworkId() {
        return physicalNetworkId;
    }

    /////////////////////////////////////////////////////
    /////////////// API Implementation///////////////////
    /////////////////////////////////////////////////////

    @Override
    public void execute() throws ResourceUnavailableException, InsufficientCapacityException, ServerApiException, ConcurrentOperationException, ResourceAllocationException {
        try {
            List<ExternalFirewallDeviceVO> fwDevices = _srxFwService.listSrxFirewalls(this);
            ListResponse<SrxFirewallResponse> response = new ListResponse<SrxFirewallResponse>();
            List<SrxFirewallResponse> fwDevicesResponse = new ArrayList<SrxFirewallResponse>();

            if (fwDevices != null && !fwDevices.isEmpty()) {
                for (ExternalFirewallDeviceVO fwDeviceVO : fwDevices) {
                    SrxFirewallResponse lbdeviceResponse = _srxFwService.createSrxFirewallResponse(fwDeviceVO);
                    fwDevicesResponse.add(lbdeviceResponse);
                }
            }

            response.setResponses(fwDevicesResponse);
            response.setResponseName(getCommandName());
            this.setResponseObject(response);
        }  catch (InvalidParameterValueException invalidParamExcp) {
            throw new ServerApiException(BaseCmd.PARAM_ERROR, invalidParamExcp.getMessage());
        } catch (CloudRuntimeException runtimeExcp) {
            throw new ServerApiException(BaseCmd.INTERNAL_ERROR, runtimeExcp.getMessage());
        }
    }

    @Override
    public String getCommandName() {
        return s_name;
    }
}

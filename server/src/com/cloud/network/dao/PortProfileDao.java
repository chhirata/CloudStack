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
package com.cloud.network.dao;

import java.util.List;
import com.cloud.network.PortProfileVO;
import com.cloud.utils.db.GenericDao;

public interface PortProfileDao extends GenericDao<PortProfileVO, Long> {

    /**
     * Return a Port Profile VO (db record) given its name.
     */
    PortProfileVO findByName(String portProfileName);
    
    /*
     * Returns true if there already is any portprofile that trunks
     * vlan IDs in a specified range.
     */
    boolean doesVlanRangeClash(int lowVlanId, int highVlanId);
    
    /*
     * Return a list of port profiles that have the specified access vlanID.
     */
    List<PortProfileVO> listByVlanId(int vlanId);
    
    /**
     * Other candidate functions that could be helpful.
     * 
     * List all portprofiles configured with a particular id.
     * List<PortProfileVO> listByVlanId(int vlanId);
     * 
     * List all uplink portprofiles (these represent physical ports).
     * List<PortProfileVO> listAllUplinkPortProfiles();	// we may have to provide some filter, like clusterId or zoneId or something.
     * 
     */
}
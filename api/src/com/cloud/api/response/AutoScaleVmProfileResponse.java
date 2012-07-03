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
package com.cloud.api.response;

import com.cloud.api.ApiConstants;
import com.cloud.utils.IdentityProxy;
import com.cloud.serializer.Param;
import com.google.gson.annotations.SerializedName;

import java.util.List;

public class AutoScaleVmProfileResponse extends BaseResponse implements ControlledEntityResponse {

    @SerializedName(ApiConstants.ZONE_ID)
    @Param(description = "the availability zone to be used while deploying a virtual machine")
    private IdentityProxy zoneId = new IdentityProxy("data_center");

    @SerializedName(ApiConstants.SERVICE_OFFERING_ID)
    @Param(description = "the service offering to be used while deploying a virtual machine")
    private IdentityProxy serviceOfferingId = new IdentityProxy("disk_offering");

    @SerializedName(ApiConstants.TEMPLATE_ID)
    @Param(description = "the template to be used while deploying a virtual machine")
    private IdentityProxy templateId = new IdentityProxy("vm_template");

    @SerializedName(ApiConstants.OTHER_DEPLOY_PARAMS)
    @Param(description = "parameters other than zoneId/serviceOfferringId/templateId to be used while deploying a virtual machine")
    private String otherDeployParams;

    @SerializedName(ApiConstants.SNMP_COMMUNITY)
    @Param(description = "snmp community string to be used to contact a virtual machine deployed by this profile")
    private String snmpCommunity;

    @SerializedName(ApiConstants.SNMP_PORT)
    @Param(description = "port at which the snmp agent is listening in a virtual machine deployed by this profile")
    private Integer snmpPort;

    @SerializedName(ApiConstants.AUTOSCALE_VM_DESTROY_TIME)
    @Param(description = "the time allowed for existing connections to get closed before a vm is destroyed")
    private Integer destroyVmGraceperiod;

    @SerializedName(ApiConstants.ACCOUNT) @Param(description="the account owning the instance group")
    private String accountName;

    @SerializedName(ApiConstants.PROJECT_ID) @Param(description="the project id vm profile")
    private IdentityProxy projectId = new IdentityProxy("projects");

    @SerializedName(ApiConstants.PROJECT) @Param(description="the project name of the vm profile")
    private String projectName;

    @SerializedName(ApiConstants.DOMAIN_ID) @Param(description="the domain ID of the vm profile")
    private IdentityProxy domainId = new IdentityProxy("domain");

    @SerializedName(ApiConstants.DOMAIN) @Param(description="the domain name of the vm profile")
    private String domainName;


    public AutoScaleVmProfileResponse() {

    }

    public void setZoneId(Long zoneId) {
        this.zoneId.setValue(zoneId);
    }

    public void setServiceOfferingId(Long serviceOfferingId) {
        this.serviceOfferingId.setValue(serviceOfferingId);
    }

    public void setTemplateId(Long templateId) {
        this.templateId.setValue(templateId);
    }

    public void setOtherDeployParams(String otherDeployParams) {
        this.otherDeployParams = otherDeployParams;
    }

    public void setSnmpCommunity(String snmpCommunity) {
        this.snmpCommunity = snmpCommunity;
    }

    public void setSnmpPort(Integer snmpPort) {
        this.snmpPort = snmpPort;
    }

    @Override
    public void setAccountName(String accountName) {
        this.accountName = accountName;
    }

    @Override
    public void setDomainId(Long domainId) {
        this.domainId.setValue(domainId);
    }

    @Override
    public void setDomainName(String domainName) {
        this.domainName = domainName;
    }

    @Override
    public void setProjectId(Long projectId) {
        this.projectId.setValue(projectId);
    }

    @Override
    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public void setDestroyVmGraceperiod(Integer destroyVmGraceperiod) {
        this.destroyVmGraceperiod = destroyVmGraceperiod;
    }
}

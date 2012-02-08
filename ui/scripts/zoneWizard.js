(function(cloudStack, $) {
 
  var networkOfferingObjs = [];
	var selectedNetworkOfferingHavingSG = false;
	var selectedNetworkOfferingHavingEIP = false;
	var selectedNetworkOfferingHavingELB = false;
	var returnedPublicVlanIpRanges = []; //public VlanIpRanges returned by API
				
  cloudStack.zoneWizard = {
    customUI: {
      publicTrafficIPRange: function(args) {
        var multiEditData = [];
        var totalIndex = 0;

        return $('<div>').multiEdit({
          context: args.context,
          noSelect: true,
          fields: {
            'gateway': { edit: true, label: 'Gateway' },
            'netmask': { edit: true, label: 'Netmask' },
            'vlanid': { edit: true, label: 'VLAN', isOptional: true },
            'startip': { edit: true, label: 'Start IP' },
            'endip': { edit: true, label: 'End IP' },
            'add-rule': { label: 'Add', addButton: true }
          },
          add: {
            label: 'Add',
            action: function(args) {
              multiEditData.push($.extend(args.data, {
                index: totalIndex
              }));

              totalIndex++;
              args.response.success();
            }
          },
          actions: {
            destroy: {
              label: 'Remove Rule',
              action: function(args) {
                multiEditData = $.grep(multiEditData, function(item) {
                  return item.index != args.context.multiRule[0].index
                });
                args.response.success();
              }
            }
          },
          dataProvider: function(args) {
            args.response.success({
              data: multiEditData
            });
          }
        });
      }
    },
    
    preFilters: {
      addPublicNetwork: function(args) {			  
				var isShown; 
				if(args.data['network-model'] == 'Basic') {
				  if(selectedNetworkOfferingHavingSG == true && selectedNetworkOfferingHavingEIP == true && selectedNetworkOfferingHavingELB == true) {
            isShown = true;
          }			
          else {
            isShown = false;
          }	
				}
				else { //args.data['network-model'] == 'Advanced'
				  isShown = true; 
				}
				return isShown;
      },

      addNetscalerDevice: function(args) { //add Netscaler
			  var isShown;
				if(args.data['network-model'] == 'Basic' && (selectedNetworkOfferingHavingSG == true && selectedNetworkOfferingHavingEIP == true && selectedNetworkOfferingHavingELB == true))
				  isShown = true;
				else
				  isShown= false;
				return isShown;				
      },

      setupPhysicalNetwork: function(args) {
        return args.data['network-model'] == 'Advanced';
      },

      configureGuestTraffic: function(args) {
        return args.data['network-model'] == 'Basic' ||
          $.grep(args.groupedData.physicalNetworks, function(network) {
            return $.inArray('guest', network.trafficTypes) > -1;
          }).length;
      },
			
			addHost: function(args) {
			  return (args.groupedData.cluster.hypervisor != "VMware");
			}
    },
    
    forms: {
      zone: {
        preFilter: function(args) {
          var $form = args.$form;
					
          if (args.data['network-model'] == 'Basic')            
					  args.$form.find('[rel=networkOfferingId]').show();		           
					else  //args.data['network-model'] == 'Advanced'      
						args.$form.find('[rel=networkOfferingId]').hide();          

          setTimeout(function() {
            if ($form.find('input[name=ispublic]').is(':checked')) {
              $form.find('[rel=domain]').hide();
            }
          });
        },
        fields: {
          name: {
            label: 'Name', validation: { required: true },
            desc: 'A name for the zone.'
          },
          dns1: {
            label: 'DNS 1', validation: { required: true },
            desc: 'Name of a DNS server for use by VMs in the zone. The public IP addresses for the zone must have a route to this server.'
          },
          dns2: {
            label: 'DNS 2',
            desc: 'A second DNS server name for use by VMs in the zone. The public IP addresses for the zone must have a route to this server.'
          },
          internaldns1: {
            label: 'Internal DNS 1', validation: { required: true },
            desc: 'Name of a DNS server for use by CloudStack\'s internal system VMs in the zone. The private IP address for the pods must have a route to this server.'
          },
          internaldns2: {
            label: 'Internal DNS 2',
            desc: 'Name of a DNS server for use by CloudStack\'s internal system VMs in the zone. The private IP address for the pods must have a route to this server.'
          },			
					networkOfferingId: {
            label: 'Network Offering',            
            select: function(args) {             
              $.ajax({
                url: createURL("listNetworkOfferings&state=Enabled&guestiptype=Shared"),
                dataType: "json",
                async: false,
                success: function(json) {
                  networkOfferingObjs = json.listnetworkofferingsresponse.networkoffering;
                  args.response.success({
                    data: $.map(networkOfferingObjs, function(offering) {
                      return {
                        id: offering.id,
                        description: offering.name
                      };
                    })
                  });
                }
              });
							args.$select.change(function(){				
                //reset when different network offering is selected							
								selectedNetworkOfferingHavingSG = false;  
								selectedNetworkOfferingHavingEIP = false; 
								selectedNetworkOfferingHavingELB = false; 
								
								var selectedNetworkOfferingId = $(this).val();
																
								$(networkOfferingObjs).each(function(){			                  							
									if(this.id == selectedNetworkOfferingId) {
										selectedNetworkOfferingObj = this;
										return false; //break $.each() loop
									}
								});
								
								$(selectedNetworkOfferingObj.service).each(function(){								 
								  var thisService = this;									
								  if(thisService.name == "SecurityGroup") {
									  selectedNetworkOfferingHavingSG = true;
									}
									else if(thisService.name == "StaticNat") {
									  $(thisService.capability).each(function(){										  
											if(this.name == "ElasticIp" && this.value == "true") {
											  selectedNetworkOfferingHavingEIP = true;
											  return false; //break $.each() loop
											}											
										});									
									}
									else if(thisService.name == "Lb") {
									  $(thisService.capability).each(function(){										  
											if(this.name == "ElasticLb" && this.value == "true") {
											  selectedNetworkOfferingHavingELB = true;
											  return false; //break $.each() loop
											}											
										});			
									}
								});		
							});							
            }
          },	
          networkdomain: {
            label: 'Network Domain',
            desc: 'A DNS suffix that will create a custom domain name for the network that is accessed by guest VMs.'
          },
          ispublic: {
            isReverse: true,
            isBoolean: true,
            label: 'Public',
						isChecked: true //checked by default (public zone)
          },
          domain: {
            label: 'Domain',
            dependsOn: 'ispublic',
            isHidden: true,
            select: function(args) {
              $.ajax({
                url: createURL("listDomains&listAll=true"),
                data: { viewAll: true },
                dataType: "json",
                async: false,
                success: function(json) {
                  domainObjs = json.listdomainsresponse.domain;
                  args.response.success({
                    data: $.map(domainObjs, function(domain) {
                      return {
                        id: domain.id,
                        description: domain.path
                      };
                    })
                  });
                }
              });
            }
          }				
        }
      },

      pod: {
        fields: {
          name: {
            label: 'Pod name',
            validation: { required: true },
            desc: 'A name for this pod.'
          },
          reservedSystemGateway: {
            label: 'Reserved system gateway',
            validation: { required: true },
            desc: 'The gateway for the hosts in the pod.'
          },
          reservedSystemNetmask: {
            label: 'Reserved system netmask',
            validation: { required: true },
            desc: 'The network prefix that defines the pod\'s subnet. Uses CIDR notation.'
          },
          reservedSystemStartIp: {
            label: 'Start Reserved system IP',
            validation: { required: true }
          },
          reservedSystemEndIp: {
            label: 'End Reserved system IP',
            validation: { required: false }
          }
        }
      },

      basicPhysicalNetwork: { //"Netscaler" now			
        fields: {				
         ip: {
						label: 'IP address'
					},
					username: {
						label: 'Username'
					},
					password: {
						label: 'Password',
						isPassword: true
					},
					networkdevicetype: {
						label: 'Type',
						select: function(args) {
							var items = [];
							items.push({id: "NetscalerMPXLoadBalancer", description: "NetScaler MPX LoadBalancer"});
							items.push({id: "NetscalerVPXLoadBalancer", description: "NetScaler VPX LoadBalancer"});
							items.push({id: "NetscalerSDXLoadBalancer", description: "NetScaler SDX LoadBalancer"});
							args.response.success({data: items});
						}
					},
					publicinterface: {
						label: 'Public interface'
					},
					privateinterface: {
						label: 'Private interface'
					},
					numretries: {
						label: 'Number of retries',
						defaultValue: '2'
					},
					inline: {
						label: 'Mode',
						select: function(args) {
							var items = [];
							items.push({id: "false", description: "side by side"});
							items.push({id: "true", description: "inline"});
							args.response.success({data: items});
						}
					},
					capacity: {
						label: 'Capacity',
						validation: { required: false, number: true }
					},
					dedicated: {
						label: 'Dedicated',
						isBoolean: true,
						isChecked: false
					}			
        }
      },

      guestTraffic: {
        preFilter: function(args) {
          var selectedZoneObj = {
            networktype: args.data['network-model']
          };

          var advancedFields = ['vlanRange'];          
          $(advancedFields).each(function() {
            if (selectedZoneObj.networktype == 'Advanced') {
              args.$form.find('[rel=' + this + ']').show();
            } 
						else {
              args.$form.find('[rel=' + this + ']').hide();
            }
          });

					var basicFields = [
            'guestGateway',
            'guestNetmask',
            'guestStartIp',
            'guestEndIp'
          ];
          $(basicFields).each(function() {
             if (selectedZoneObj.networktype == 'Basic') {
              args.$form.find('[rel=' + this + ']').show(); 
            } 
						else {
              args.$form.find('[rel=' + this + ']').hide();
            }         
          });
        },

        fields: {		
					//Basic (start)				
          guestGateway: { label: 'Guest gateway' },
          guestNetmask: { label: 'Guest netmask' },
          guestStartIp: { label: 'Guest start IP' },
          guestEndIp: { label: 'Guest end IP' },		
					//Basic (end)
					
					//Advanced (start)
          vlanRange: {
            label: 'VLAN Range',
            range: ['vlanRangeStart', 'vlanRangeEnd'],
            validation: { required: true, digits: true }
          }
					//Advanced (end)
        }
      },
      cluster: {
        fields: {
          hypervisor: {
            label: 'Hypervisor',
            select: function(args) {
              $.ajax({
                url: createURL("listHypervisors"),
                dataType: "json",
                async: false,
                success: function(json) {
                  var hypervisors = json.listhypervisorsresponse.hypervisor;
                  var items = [];
                  $(hypervisors).each(function() {
                    items.push({id: this.name, description: this.name})
                  });
                  args.response.success({data: items});
                }
              });

              args.$select.bind("change", function(event) {
                var $form = $(this).closest('form');
                if($(this).val() == "VMware") {
                  //$('li[input_sub_group="external"]', $dialogAddCluster).show();
                  $form.find('[rel=vCenterHost]').css('display', 'block');
                  $form.find('[rel=vCenterUsername]').css('display', 'block');
                  $form.find('[rel=vCenterPassword]').css('display', 'block');
                  $form.find('[rel=vCenterDatacenter]').css('display', 'block');

                  //$("#cluster_name_label", $dialogAddCluster).text("vCenter Cluster:");
                }
                else {
                  //$('li[input_group="vmware"]', $dialogAddCluster).hide();
                  $form.find('[rel=vCenterHost]').css('display', 'none');
                  $form.find('[rel=vCenterUsername]').css('display', 'none');
                  $form.find('[rel=vCenterPassword]').css('display', 'none');
                  $form.find('[rel=vCenterDatacenter]').css('display', 'none');

                  //$("#cluster_name_label", $dialogAddCluster).text("Cluster:");
                }
              });
            }
          },
          name: {
            label: 'Cluster Name',
            validation: { required: true }
          },

          //hypervisor==VMWare begins here
          vCenterHost: {
            label: 'vCenter Host',
            validation: { required: true }
          },
          vCenterUsername: {
            label: 'vCenter Username',
            validation: { required: true }
          },
          vCenterPassword: {
            label: 'vCenter Password',
            validation: { required: true },
            isPassword: true
          },
          vCenterDatacenter: {
            label: 'vCenter Datacenter',
            validation: { required: true }
          }
          //hypervisor==VMWare ends here
        }
      },
      host: {
        preFilter: function(args) {
          var selectedClusterObj = {
            hypervisortype: args.data.hypervisor
          };

          var $form = args.$form;

          if(selectedClusterObj.hypervisortype == "VMware") {
            //$('li[input_group="general"]', $dialogAddHost).hide();
            $form.find('[rel=hostname]').hide();
            $form.find('[rel=username]').hide();
            $form.find('[rel=password]').hide();

            //$('li[input_group="vmware"]', $dialogAddHost).show();
            $form.find('[rel=vcenterHost]').css('display', 'block');

            //$('li[input_group="baremetal"]', $dialogAddHost).hide();
            $form.find('[rel=baremetalCpuCores]').hide();
            $form.find('[rel=baremetalCpu]').hide();
            $form.find('[rel=baremetalMemory]').hide();
            $form.find('[rel=baremetalMAC]').hide();

            //$('li[input_group="Ovm"]', $dialogAddHost).hide();
            $form.find('[rel=agentUsername]').hide();
            $form.find('[rel=agentPassword]').hide();
          }
          else if (selectedClusterObj.hypervisortype == "BareMetal") {
            //$('li[input_group="general"]', $dialogAddHost).show();
            $form.find('[rel=hostname]').css('display', 'block');
            $form.find('[rel=username]').css('display', 'block');
            $form.find('[rel=password]').css('display', 'block');

            //$('li[input_group="baremetal"]', $dialogAddHost).show();
            $form.find('[rel=baremetalCpuCores]').css('display', 'block');
            $form.find('[rel=baremetalCpu]').css('display', 'block');
            $form.find('[rel=baremetalMemory]').css('display', 'block');
            $form.find('[rel=baremetalMAC]').css('display', 'block');

            //$('li[input_group="vmware"]', $dialogAddHost).hide();
            $form.find('[rel=vcenterHost]').hide();

            //$('li[input_group="Ovm"]', $dialogAddHost).hide();
            $form.find('[rel=agentUsername]').hide();
            $form.find('[rel=agentPassword]').hide();
          }
          else if (selectedClusterObj.hypervisortype == "Ovm") {
            //$('li[input_group="general"]', $dialogAddHost).show();
            $form.find('[rel=hostname]').css('display', 'block');
            $form.find('[rel=username]').css('display', 'block');
            $form.find('[rel=password]').css('display', 'block');

            //$('li[input_group="vmware"]', $dialogAddHost).hide();
            $form.find('[rel=vcenterHost]').hide();

            //$('li[input_group="baremetal"]', $dialogAddHost).hide();
            $form.find('[rel=baremetalCpuCores]').hide();
            $form.find('[rel=baremetalCpu]').hide();
            $form.find('[rel=baremetalMemory]').hide();
            $form.find('[rel=baremetalMAC]').hide();

            //$('li[input_group="Ovm"]', $dialogAddHost).show();
            $form.find('[rel=agentUsername]').css('display', 'block');
            $form.find('[rel=agentUsername]').find('input').val("oracle");
            $form.find('[rel=agentPassword]').css('display', 'block');
          }
          else {
            //$('li[input_group="general"]', $dialogAddHost).show();
            $form.find('[rel=hostname]').css('display', 'block');
            $form.find('[rel=username]').css('display', 'block');
            $form.find('[rel=password]').css('display', 'block');

            //$('li[input_group="vmware"]', $dialogAddHost).hide();
            $form.find('[rel=vcenterHost]').hide();

            //$('li[input_group="baremetal"]', $dialogAddHost).hide();
            $form.find('[rel=baremetalCpuCores]').hide();
            $form.find('[rel=baremetalCpu]').hide();
            $form.find('[rel=baremetalMemory]').hide();
            $form.find('[rel=baremetalMAC]').hide();

            //$('li[input_group="Ovm"]', $dialogAddHost).hide();
            $form.find('[rel=agentUsername]').hide();
            $form.find('[rel=agentPassword]').hide();
          }
        },
        fields: {
          hostname: {
            label: 'Host name',
            validation: { required: true },
            isHidden: true
          },

          username: {
            label: 'User name',
            validation: { required: true },
            isHidden: true
          },

          password: {
            label: 'Password',
            validation: { required: true },
            isHidden: true,
            isPassword: true
          },
          //input_group="general" ends here

          //input_group="VMWare" starts here
          vcenterHost: {
            label: 'ESX/ESXi Host',
            validation: { required: true },
            isHidden: true
          },
          //input_group="VMWare" ends here

          //input_group="BareMetal" starts here
          baremetalCpuCores: {
            label: '# of CPU Cores',
            validation: { required: true },
            isHidden: true
          },
          baremetalCpu: {
            label: 'CPU (in MHz)',
            validation: { required: true },
            isHidden: true
          },
          baremetalMemory: {
            label: 'Memory (in MB)',
            validation: { required: true },
            isHidden: true
          },
          baremetalMAC: {
            label: 'Host MAC',
            validation: { required: true },
            isHidden: true
          },
          //input_group="BareMetal" ends here

          //input_group="OVM" starts here
          agentUsername: {
            label: 'Agent Username',
            validation: { required: false },
            isHidden: true
          },
          agentPassword: {
            label: 'Agent Password',
            validation: { required: true },
            isHidden: true,
            isPassword: true
          },
          //input_group="OVM" ends here

          //always appear (begin)
          hosttags: {
            label: 'Host tags',
            validation: { required: false }
          }
          //always appear (end)
        }
      },
      primaryStorage: {
        preFilter: function(args) {},
        
        fields: {
          name: {
            label: 'Name',
            validation: { required: true }
          },

          protocol: {
            label: 'Protocol',
            validation: { required: true },
            select: function(args) {
              var selectedClusterObj = {
                hypervisortype: args.context.zones[0].hypervisor
              };

              if(selectedClusterObj == null)
                return;

              if(selectedClusterObj.hypervisortype == "KVM") {
                var items = [];
                items.push({id: "nfs", description: "nfs"});
                items.push({id: "SharedMountPoint", description: "SharedMountPoint"});
								items.push({id: "clvm", description: "CLVM"});
                args.response.success({data: items});
              }
              else if(selectedClusterObj.hypervisortype == "XenServer") {
                var items = [];
                items.push({id: "nfs", description: "nfs"});
                items.push({id: "PreSetup", description: "PreSetup"});
                items.push({id: "iscsi", description: "iscsi"});
                args.response.success({data: items});
              }
              else if(selectedClusterObj.hypervisortype == "VMware") {
                var items = [];
                items.push({id: "nfs", description: "nfs"});
                items.push({id: "vmfs", description: "vmfs"});
                args.response.success({data: items});
              }
              else if(selectedClusterObj.hypervisortype == "Ovm") {
                var items = [];
                items.push({id: "nfs", description: "nfs"});
                items.push({id: "ocfs2", description: "ocfs2"});
                args.response.success({data: items});
              }
              else {
                args.response.success({data:[]});
              }

              args.$select.change(function() {
                var $form = $(this).closest('form');

                var protocol = $(this).val();
                if(protocol == null)
                  return;

                if(protocol == "nfs") {
                  //$("#add_pool_server_container", $dialogAddPool).show();
                  $form.find('[rel=server]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_nfs_server").val("");
                  $form.find('[rel=server]').find(".value").find("input").val("");

                  //$('li[input_group="nfs"]', $dialogAddPool).show();
                  $form.find('[rel=path]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_path_container").find("label").text(g_dictionary["label.path"]+":");
                  $form.find('[rel=path]').find(".name").find("label").text("Path:");

                  //$('li[input_group="iscsi"]', $dialogAddPool).hide();
                  $form.find('[rel=iqn]').hide();
                  $form.find('[rel=lun]').hide();

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).hide();
                  $form.find('[rel=vCenterDataCenter]').hide();
                  $form.find('[rel=vCenterDataStore]').hide();
                }
                else if(protocol == "ocfs2") {//ocfs2 is the same as nfs, except no server field.
                  //$dialogAddPool.find("#add_pool_server_container").hide();
                  $form.find('[rel=server]').hide();
                  //$dialogAddPool.find("#add_pool_nfs_server").val("");
                  $form.find('[rel=server]').find(".value").find("input").val("");

                  //$('li[input_group="nfs"]', $dialogAddPool).show();
                  $form.find('[rel=path]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_path_container").find("label").text(g_dictionary["label.path"]+":");
                  $form.find('[rel=path]').find(".name").find("label").text("Path:");

                  //$('li[input_group="iscsi"]', $dialogAddPool).hide();
                  $form.find('[rel=iqn]').hide();
                  $form.find('[rel=lun]').hide();

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).hide();
                  $form.find('[rel=vCenterDataCenter]').hide();
                  $form.find('[rel=vCenterDataStore]').hide();
                }
                else if(protocol == "PreSetup") {
                  //$dialogAddPool.find("#add_pool_server_container").hide();
                  $form.find('[rel=server]').hide();
                  //$dialogAddPool.find("#add_pool_nfs_server").val("localhost");
                  $form.find('[rel=server]').find(".value").find("input").val("localhost");

                  //$('li[input_group="nfs"]', $dialogAddPool).show();
                  $form.find('[rel=path]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_path_container").find("label").text(g_dictionary["label.SR.name"]+":");
                  $form.find('[rel=path]').find(".name").find("label").text("SR Name-Label:");

                  //$('li[input_group="iscsi"]', $dialogAddPool).hide();
                  $form.find('[rel=iqn]').hide();
                  $form.find('[rel=lun]').hide();

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();													
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).hide();
                  $form.find('[rel=vCenterDataCenter]').hide();
                  $form.find('[rel=vCenterDataStore]').hide();
                }
                else if(protocol == "iscsi") {
                  //$dialogAddPool.find("#add_pool_server_container").show();
                  $form.find('[rel=server]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_nfs_server").val("");
                  $form.find('[rel=server]').find(".value").find("input").val("");

                  //$('li[input_group="nfs"]', $dialogAddPool).hide();
                  $form.find('[rel=path]').hide();

                  //$('li[input_group="iscsi"]', $dialogAddPool).show();
                  $form.find('[rel=iqn]').css('display', 'block');
                  $form.find('[rel=lun]').css('display', 'block');

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).hide();
                  $form.find('[rel=vCenterDataCenter]').hide();
                  $form.find('[rel=vCenterDataStore]').hide();
                }			
								else if($(this).val() == "clvm") {
									//$("#add_pool_server_container", $dialogAddPool).hide();
									$form.find('[rel=server]').hide();
									//$dialogAddPool.find("#add_pool_nfs_server").val("localhost");
									$form.find('[rel=server]').find(".value").find("input").val("localhost");
									
									//$('li[input_group="nfs"]', $dialogAddPool).hide();
									$form.find('[rel=path]').hide();
									
									//$('li[input_group="iscsi"]', $dialogAddPool).hide();
									 $form.find('[rel=iqn]').hide();
									$form.find('[rel=lun]').hide();
									
									//$('li[input_group="clvm"]', $dialogAddPool).show();
									$form.find('[rel=volumegroup]').css('display', 'inline-block');
									
									//$('li[input_group="vmfs"]', $dialogAddPool).hide();
									$form.find('[rel=vCenterDataCenter]').hide();
									$form.find('[rel=vCenterDataStore]').hide();
								}										
                else if(protocol == "vmfs") {
                  //$dialogAddPool.find("#add_pool_server_container").show();
                  $form.find('[rel=server]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_nfs_server").val("");
                  $form.find('[rel=server]').find(".value").find("input").val("");

                  //$('li[input_group="nfs"]', $dialogAddPool).hide();
                  $form.find('[rel=path]').hide();

                  //$('li[input_group="iscsi"]', $dialogAddPool).hide();
                  $form.find('[rel=iqn]').hide();
                  $form.find('[rel=lun]').hide();

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).show();
                  $form.find('[rel=vCenterDataCenter]').css('display', 'block');
                  $form.find('[rel=vCenterDataStore]').css('display', 'block');
                }
                else if(protocol == "SharedMountPoint") {  //"SharedMountPoint" show the same fields as "nfs" does.
                  //$dialogAddPool.find("#add_pool_server_container").hide();
                  $form.find('[rel=server]').hide();
                  //$dialogAddPool.find("#add_pool_nfs_server").val("localhost");
                  $form.find('[rel=server]').find(".value").find("input").val("localhost");

                  //$('li[input_group="nfs"]', $dialogAddPool).show();
                  $form.find('[rel=path]').css('display', 'block');
                  $form.find('[rel=path]').find(".name").find("label").text("Path:");

                  //$('li[input_group="iscsi"]', $dialogAddPool).hide();
                  $form.find('[rel=iqn]').hide();
                  $form.find('[rel=lun]').hide();

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();													
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).hide();
                  $form.find('[rel=vCenterDataCenter]').hide();
                  $form.find('[rel=vCenterDataStore]').hide();
                }
                else {
                  //$dialogAddPool.find("#add_pool_server_container").show();
                  $form.find('[rel=server]').css('display', 'block');
                  //$dialogAddPool.find("#add_pool_nfs_server").val("");
                  $form.find('[rel=server]').find(".value").find("input").val("");

                  //$('li[input_group="iscsi"]', $dialogAddPool).hide();
                  $form.find('[rel=iqn]').hide();
                  $form.find('[rel=lun]').hide();

									//$('li[input_group="clvm"]', $dialogAddPool).hide();
									$form.find('[rel=volumegroup]').hide();
									
                  //$('li[input_group="vmfs"]', $dialogAddPool).hide();
                  $form.find('[rel=vCenterDataCenter]').hide();
                  $form.find('[rel=vCenterDataStore]').hide();
                }
              });

              args.$select.trigger("change");
            }
          },
          server: {
            label: 'Server',
            validation: { required: true },
            isHidden: true
          },

          //nfs
          path: {
            label: 'Path',
            validation: { required: true },
            isHidden: true
          },

          //iscsi
          iqn: {
            label: 'Target IQN',
            validation: { required: true },
            isHidden: true
          },
          lun: {
            label: 'LUN #',
            validation: { required: true },
            isHidden: true
          },

					//clvm
					volumegroup: {
						label: 'Volume Group',
						validation: { required: true },
						isHidden: true
					},
					
          //vmfs
          vCenterDataCenter: {
            label: 'vCenter Datacenter',
            validation: { required: true },
            isHidden: true
          },
          vCenterDataStore: {
            label: 'vCenter Datastore',
            validation: { required: true },
            isHidden: true
          },

          //always appear (begin)
          storageTags: {
            label: 'Storage Tags',
            validation: { required: false }
          }
          //always appear (end)
        }
      },
      secondaryStorage: {
        fields: {
          nfsServer: {
            label: 'NFS Server',
            validation: { required: true }
          },
          path: {
            label: 'Path',
            validation: { required: true }
          }
        }
      }
    },

    action: function(args) {    
		  //debugger;
			var advZoneConfiguredPhysicalNetworkCount = 0; //for multiple physical networks in advanced zone
			
      var success = args.response.success;
      var error = args.response.error;
      var message = args.response.message;
      //var data = args.data; 
      var startFn = args.startFn;
      var data = args.data;
					
      var stepFns = {
        addZone: function() {
          message('Creating zone');
          
					var array1 = [];					
					var networkType = args.data.zone.networkType;  //"Basic", "Advanced"			
					array1.push("&networktype=" + todb(networkType));
					if(networkType == "Advanced") 
						array1.push("&securitygroupenabled=false");  					

					array1.push("&name=" + todb(args.data.zone.name));

					array1.push("&dns1=" + todb(args.data.zone.dns1));

					var dns2 = args.data.zone.dns2;
					if (dns2 != null && dns2.length > 0)
						array1.push("&dns2=" + todb(dns2));

					array1.push("&internaldns1="+todb(args.data.zone.internaldns1));

					var internaldns2 = args.data.zone.internaldns2;
					if (internaldns2 != null && internaldns2.length > 0)
						array1.push("&internaldns2=" + todb(internaldns2));
						
					if(args.data.zone.ispublic == null) //public checkbox is unchecked
						array1.push("&domainid=" + args.data.zone.domain);
				 
					if(args.data.zone.networkdomain != null && args.data.zone.networkdomain.length > 0)  
						array1.push("&domain=" + todb(args.data.zone.networkdomain));
										
					$.ajax({
						url: createURL("createZone" + array1.join("")),
						dataType: "json",
						async: false,
						success: function(json) {							
							stepFns.addPhysicalNetworks({
								data: $.extend(args.data, {
									returnedZone: json.createzoneresponse.zone
								})
							});							
						},
						error: function(XMLHttpResponse) {						  
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addZone', errorMsg, { fn: 'addZone', args: args });
						}
					});
        },
        
        addPhysicalNetworks: function(args) {
          message('Creating physical network(s)');
          	
          var returnedPhysicalNetworks = [];
					
					if(args.data.zone.networkType == "Basic") {					  
						var requestedTrafficTypeCount = 2; //request guest traffic type, management traffic type			
						if(selectedNetworkOfferingHavingSG == true && selectedNetworkOfferingHavingEIP == true && selectedNetworkOfferingHavingELB == true) 
						  requestedTrafficTypeCount++; //request public traffic type
												
						$.ajax({
							url: createURL("createPhysicalNetwork&zoneid=" + args.data.returnedZone.id + "&name=PhysicalNetworkInBasicZone"),
							dataType: "json",														
							success: function(json) {														 
								var jobId = json.createphysicalnetworkresponse.jobid;
								var timerKey = "createPhysicalNetworkJob_" + jobId;
								$("body").everyTime(2000, timerKey, function(){															  
									$.ajax({
										url: createURL("queryAsyncJobResult&jobid=" + jobId),
										dataType: "json",
										success: function(json) {
											var result = json.queryasyncjobresultresponse;																		
											if (result.jobstatus == 0) {
												return; //Job has not completed
											}
											else {
												$("body").stopTime(timerKey);
												if (result.jobstatus == 1) {
													var returnedBasicPhysicalNetwork = result.jobresult.physicalnetwork;																										
																										
													var returnedTrafficTypes = [];		
													
													$.ajax({
														url: createURL("addTrafficType&trafficType=Guest&physicalnetworkid=" + returnedBasicPhysicalNetwork.id),
														dataType: "json",
														success: function(json) {																					  
															var jobId = json.addtraffictyperesponse.jobid;
															var timerKey = "addTrafficTypeJob_" + jobId;
															$("body").everyTime(2000, timerKey, function() {																						  
																$.ajax({
																	url: createURL("queryAsyncJobResult&jobid=" + jobId),
																	dataType: "json", 
																	success: function(json) {
																		var result = json.queryasyncjobresultresponse;
																		if (result.jobstatus == 0) {
																			return; //Job has not completed
																		}
																		else {
																			$("body").stopTime(timerKey);
																			if (result.jobstatus == 1) {	                                          
																				returnedTrafficTypes.push(result.jobresult.traffictype);	
																				
																				if(returnedTrafficTypes.length == requestedTrafficTypeCount) { //all requested traffic types have been added
																				  returnedBasicPhysicalNetwork.returnedTrafficTypes = returnedTrafficTypes;
																																																													
																					stepFns.configurePhysicalNetwork({
																						data: $.extend(args.data, {
																							returnedBasicPhysicalNetwork: returnedBasicPhysicalNetwork
																						})
																					});			
																				}																				
																			}
																			else if (result.jobstatus == 2) {
																				alert("Failed to add Guest traffic type to basic zone. Error: " + fromdb(result.jobresult.errortext));
																			}
																		}	
																	},																								
																	error: function(XMLHttpResponse) {
																		var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																		alert("Failed to add Guest traffic type to basic zone. Error: " + errorMsg);
																	}
																});																							
															});	
														}
													});		
													
                          $.ajax({
														url: createURL("addTrafficType&trafficType=Management&physicalnetworkid=" + returnedBasicPhysicalNetwork.id),
														dataType: "json",
														success: function(json) {																					  
															var jobId = json.addtraffictyperesponse.jobid;
															var timerKey = "addTrafficTypeJob_" + jobId;
															$("body").everyTime(2000, timerKey, function() {																						  
																$.ajax({
																	url: createURL("queryAsyncJobResult&jobid=" + jobId),
																	dataType: "json", 
																	success: function(json) {
																		var result = json.queryasyncjobresultresponse;
																		if (result.jobstatus == 0) {
																			return; //Job has not completed
																		}
																		else {
																			$("body").stopTime(timerKey);
																			if (result.jobstatus == 1) {	                                          
																				returnedTrafficTypes.push(result.jobresult.traffictype);	
																				
																				if(returnedTrafficTypes.length == requestedTrafficTypeCount) { //all requested traffic types have been added
																				  returnedBasicPhysicalNetwork.returnedTrafficTypes = returnedTrafficTypes;
																																																													
																					stepFns.configurePhysicalNetwork({
																						data: $.extend(args.data, {
																							returnedBasicPhysicalNetwork: returnedBasicPhysicalNetwork
																						})
																					});			
																				}																									
																			}
																			else if (result.jobstatus == 2) {
																				alert("Failed to add Management traffic type to basic zone. Error: " + fromdb(result.jobresult.errortext));
																			}
																		}	
																	},																								
																	error: function(XMLHttpResponse) {
																		var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																		alert("Failed to add Management traffic type to basic zone. Error: " + errorMsg);
																	}
																});																							
															});	
														}
													});			
													
                          if(selectedNetworkOfferingHavingSG == true && selectedNetworkOfferingHavingEIP == true && selectedNetworkOfferingHavingELB == true) {													
														$.ajax({
															url: createURL("addTrafficType&trafficType=Public&physicalnetworkid=" + returnedBasicPhysicalNetwork.id),
															dataType: "json",
															success: function(json) {																					  
																var jobId = json.addtraffictyperesponse.jobid;
																var timerKey = "addTrafficTypeJob_" + jobId;
																$("body").everyTime(2000, timerKey, function() {																						  
																	$.ajax({
																		url: createURL("queryAsyncJobResult&jobid=" + jobId),
																		dataType: "json", 
																		success: function(json) {
																			var result = json.queryasyncjobresultresponse;
																			if (result.jobstatus == 0) {
																				return; //Job has not completed
																			}
																			else {
																				$("body").stopTime(timerKey);
																				if (result.jobstatus == 1) {	                                          
																					returnedTrafficTypes.push(result.jobresult.traffictype);	
																					
																					if(returnedTrafficTypes.length == requestedTrafficTypeCount) { //all requested traffic types have been added
																						returnedBasicPhysicalNetwork.returnedTrafficTypes = returnedTrafficTypes;
																																																														
																						stepFns.configurePhysicalNetwork({
																							data: $.extend(args.data, {
																								returnedBasicPhysicalNetwork: returnedBasicPhysicalNetwork
																							})
																						});			
																					}		
																				}
																				else if (result.jobstatus == 2) {
																					alert("Failed to add Public traffic type to basic zone. Error: " + fromdb(result.jobresult.errortext));
																				}
																			}	
																		},																								
																		error: function(XMLHttpResponse) {
																			var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																			alert("Failed to add Public traffic type to basic zone. Error: " + errorMsg);
																		}
																	});																							
																});	
															}
														});		
													}													                      
												}
												else if (result.jobstatus == 2) {																			  
													alert("createPhysicalNetwork failed. Error: " + fromdb(result.jobresult.errortext));
												}
											}		
										},																																		
										error: function(XMLHttpResponse) {
											var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
											alert("createPhysicalNetwork failed. Error: " + errorMsg);
										}																			
									});															
								});															
							}
						});		
					}					
					else if(args.data.zone.networkType == "Advanced") {					  
						$(args.data.physicalNetworks).each(function(){					  	            
							var thisPhysicalNetwork = this;						
							$.ajax({
								url: createURL("createPhysicalNetwork&zoneid=" + args.data.returnedZone.id + "&name=" + todb(thisPhysicalNetwork.name)),
								dataType: "json",														
								success: function(json) {														 
									var jobId = json.createphysicalnetworkresponse.jobid;
									var timerKey = "createPhysicalNetworkJob_" + jobId;
									$("body").everyTime(2000, timerKey, function(){															  
										$.ajax({
											url: createURL("queryAsyncJobResult&jobid=" + jobId),
											dataType: "json",
											success: function(json) {
												var result = json.queryasyncjobresultresponse;																		
												if (result.jobstatus == 0) {
													return; //Job has not completed
												}
												else {
													$("body").stopTime(timerKey);
													if (result.jobstatus == 1) {
														var returnedPhysicalNetwork = result.jobresult.physicalnetwork;																										
                            returnedPhysicalNetwork.originalId = thisPhysicalNetwork.id;															
															
														var returnedTrafficTypes = [];													
														$(thisPhysicalNetwork.trafficTypes).each(function(){													  
															var thisTrafficType = this;
															var apiCmd = "addTrafficType&physicalnetworkid=" + returnedPhysicalNetwork.id;
															if(thisTrafficType == "public")
																apiCmd += "&trafficType=Public";
															else if(thisTrafficType == "management")
																apiCmd += "&trafficType=Management";
															else if(thisTrafficType == "guest")
																apiCmd += "&trafficType=Guest";
															else if(thisTrafficType == "storage")
																apiCmd += "&trafficType=Storage";
																													
															$.ajax({
																url: createURL(apiCmd),
																dataType: "json",
																success: function(json) {																					  
																	var jobId = json.addtraffictyperesponse.jobid;
																	var timerKey = "addTrafficTypeJob_" + jobId;
																	$("body").everyTime(2000, timerKey, function() {																						  
																		$.ajax({
																			url: createURL("queryAsyncJobResult&jobid=" + jobId),
																			dataType: "json", 
																			success: function(json) {
																				var result = json.queryasyncjobresultresponse;
																				if (result.jobstatus == 0) {
																					return; //Job has not completed
																				}
																				else {
																					$("body").stopTime(timerKey);
																					if (result.jobstatus == 1) {	                                          
																						returnedTrafficTypes.push(result.jobresult.traffictype);			

																						if(returnedTrafficTypes.length == thisPhysicalNetwork.trafficTypes.length) { //this physical network is complete (specified traffic types are added)
																							returnedPhysicalNetwork.returnedTrafficTypes = returnedTrafficTypes;
																							returnedPhysicalNetworks.push(returnedPhysicalNetwork);
																							
																							if(returnedPhysicalNetworks.length == args.data.physicalNetworks.length) { //all physical networks are complete
																								stepFns.configurePhysicalNetwork({
																									data: $.extend(args.data, {
																										returnedPhysicalNetworks: returnedPhysicalNetworks
																									})
																								});
																							}
																						}																						
																					}
																					else if (result.jobstatus == 2) {
																						alert(apiCmd + " failed. Error: " + fromdb(result.jobresult.errortext));
																					}
																				}	
																			},																								
																			error: function(XMLHttpResponse) {
																				var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																				alert(apiCmd + " failed. Error: " + errorMsg);
																			}
																		});																							
																	});	
																}
															});								
														});													
													}
													else if (result.jobstatus == 2) {																			  
														alert("createPhysicalNetwork failed. Error: " + fromdb(result.jobresult.errortext));
													}
												}		
											},																																		
											error: function(XMLHttpResponse) {
												var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
												alert("createPhysicalNetwork failed. Error: " + errorMsg);
											}																			
										});															
									});															
								}
							});										
						});	
          }        				
        },
        
				//afterCreateZonePhysicalNetworkTrafficTypes: enable physical network, enable virtual router element, enable network service provider
				configurePhysicalNetwork: function(args) {				  
					message('Configuring physical network(s)');
					
					if(args.data.zone.networkType == "Basic") {							  			
						$.ajax({
							url: createURL("updatePhysicalNetwork&state=Enabled&id=" + args.data.returnedBasicPhysicalNetwork.id),
							dataType: "json",
							success: function(json) {
								//var jobId = json.updatephysicalnetworkresponse.jobid;
								var updatePhysicalNetworkTimer = "updatePhysicalNetworkJob_" + json.updatephysicalnetworkresponse.jobid;
								$("body").everyTime(2000, updatePhysicalNetworkTimer, function() {
									$.ajax({
										url: createURL("queryAsyncJobResult&jobId=" + json.updatephysicalnetworkresponse.jobid),
										dataType: "json",
										success: function(json) {
											var result = json.queryasyncjobresultresponse;
											if (result.jobstatus == 0) {
												return; //Job has not completed
											}
											else {
												$("body").stopTime(updatePhysicalNetworkTimer);
												if (result.jobstatus == 1) {
													//alert("updatePhysicalNetwork succeeded.");

													// get network service provider ID of Virtual Router
													var virtualRouterProviderId;
													$.ajax({
														url: createURL("listNetworkServiceProviders&name=VirtualRouter&physicalNetworkId=" + args.data.returnedBasicPhysicalNetwork.id),
														dataType: "json",
														async: false,
														success: function(json) {
															var items = json.listnetworkserviceprovidersresponse.networkserviceprovider;
															if(items != null && items.length > 0) {
																virtualRouterProviderId = items[0].id;
															}
														}
													});
													if(virtualRouterProviderId == null) {
														alert("error: listNetworkServiceProviders API doesn't return VirtualRouter provider ID");
														return;
													}

													var virtualRouterElementId;
													$.ajax({
														url: createURL("listVirtualRouterElements&nspid=" + virtualRouterProviderId),
														dataType: "json",
														async: false,
														success: function(json) {
															var items = json.listvirtualrouterelementsresponse.virtualrouterelement;
															if(items != null && items.length > 0) {
																virtualRouterElementId = items[0].id;
															}
														}
													});
													if(virtualRouterElementId == null) {
														alert("error: listVirtualRouterElements API doesn't return Virtual Router Element Id");
														return;
													}

													$.ajax({
														url: createURL("configureVirtualRouterElement&enabled=true&id=" + virtualRouterElementId),
														dataType: "json",
														async: false,
														success: function(json) {
															//var jobId = json.configurevirtualrouterelementresponse.jobid;
															var configureVirtualRouterElementTimer = "configureVirtualRouterElementJob_" + json.configurevirtualrouterelementresponse.jobid;
															$("body").everyTime(2000, configureVirtualRouterElementTimer, function() {
																$.ajax({
																	url: createURL("queryAsyncJobResult&jobId=" + json.configurevirtualrouterelementresponse.jobid),
																	dataType: "json",
																	success: function(json) {
																		var result = json.queryasyncjobresultresponse;
																		if (result.jobstatus == 0) {
																			return; //Job has not completed
																		}
																		else {
																			$("body").stopTime(configureVirtualRouterElementTimer);
																			if (result.jobstatus == 1) {
																				//alert("configureVirtualRouterElement succeeded.");

																				$.ajax({
																					url: createURL("updateNetworkServiceProvider&state=Enabled&id=" + virtualRouterProviderId),
																					dataType: "json",
																					async: false,
																					success: function(json) {
																						//var jobId = json.updatenetworkserviceproviderresponse.jobid;
																						var updateNetworkServiceProviderTimer = "updateNetworkServiceProviderJob_" + json.updatenetworkserviceproviderresponse.jobid;
																						$("body").everyTime(2000, updateNetworkServiceProviderTimer, function() {
																							$.ajax({
																								url: createURL("queryAsyncJobResult&jobId=" + json.updatenetworkserviceproviderresponse.jobid),
																								dataType: "json",
																								success: function(json) {
																									var result = json.queryasyncjobresultresponse;
																									if (result.jobstatus == 0) {
																										return; //Job has not completed
																									}
																									else {
																										$("body").stopTime(updateNetworkServiceProviderTimer);
																										if (result.jobstatus == 1) {
																											//alert("Virtual Router Provider is enabled");
																																																						
																											if(selectedNetworkOfferingHavingSG == true) { //need to Enable security group provider first
																												// get network service provider ID of Security Group
																												var securityGroupProviderId;
																												$.ajax({
																													url: createURL("listNetworkServiceProviders&name=SecurityGroupProvider&physicalNetworkId=" + args.data.returnedBasicPhysicalNetwork.id),
																													dataType: "json",
																													async: false,
																													success: function(json) {																																				
																														var items = json.listnetworkserviceprovidersresponse.networkserviceprovider;
																														if(items != null && items.length > 0) {
																															securityGroupProviderId = items[0].id;
																														}
																													}
																												});
																												if(securityGroupProviderId == null) {
																													alert("error: listNetworkServiceProviders API doesn't return security group provider ID");
																													return;
																												}                                      
																													
																												$.ajax({
																													url: createURL("updateNetworkServiceProvider&state=Enabled&id=" + securityGroupProviderId),
																													dataType: "json",
																													async: false,
																													success: function(json) {																														
																														var updateNetworkServiceProviderTimer = "asyncJob_" + json.updatenetworkserviceproviderresponse.jobid;																														
																														$("body").everyTime(2000, updateNetworkServiceProviderTimer, function() {
																															$.ajax({
																																url: createURL("queryAsyncJobResult&jobId=" + json.updatenetworkserviceproviderresponse.jobid),
																																dataType: "json",
																																success: function(json) {
																																	var result = json.queryasyncjobresultresponse;
																																	if (result.jobstatus == 0) {
																																		return; //Job has not completed
																																	}
																																	else {																																										
																																		$("body").stopTime(updateNetworkServiceProviderTimer);
																																		if (result.jobstatus == 1) { //Security group provider has been enabled successfully	
                                                                      //"ElasticIP + ElasticLB"																															
																																			if(selectedNetworkOfferingHavingEIP == true && selectedNetworkOfferingHavingELB == true) { //inside "selectedNetworkOfferingHavingSG == true" section 
																																			  //add netscaler provider (start)																																				
																																				$.ajax({
																																					url: createURL("addNetworkServiceProvider&name=Netscaler&physicalnetworkid=" + args.data.returnedBasicPhysicalNetwork.id),
																																					dataType: "json",
																																					async: false,
																																					success: function(json) {
																																						var addNetworkServiceProviderTimer = "asyncJob_" + json.addnetworkserviceproviderresponse.jobid;																																			
																																						$("body").everyTime(2000, addNetworkServiceProviderTimer, function() {		
																																							$.ajax({
																																								url: createURL("queryAsyncJobResult&jobId=" + json.addnetworkserviceproviderresponse.jobid),
																																								dataType: "json",
																																								success: function(json) {																																								 
																																									var result = json.queryasyncjobresultresponse;																																									
																																									if (result.jobstatus == 0) {
																																										return; //Job has not completed
																																									}
																																									else {
																																										$("body").stopTime(addNetworkServiceProviderTimer);
																																										if (result.jobstatus == 1) {																																											
																																											args.data.returnedNetscalerProvider = result.jobresult.networkserviceprovider;
																																													                                                                                      
																																											stepFns.addNetscalerDevice({
																																												data: args.data
																																											});																																													
																																										}
																																										else if (result.jobstatus == 2) {
																																											alert("addNetworkServiceProvider&name=Netscaler failed. Error: " + fromdb(result.jobresult.errortext));
																																										}
																																									}
																																								},
																																								error: function(XMLHttpResponse) {
																																									var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																																									alert("addNetworkServiceProvider&name=Netscaler failed. Error: " + errorMsg);
																																								}
																																							});
																																						});
																																					}
																																				});			
																																				//add netscaler provider (end)
																																			}
																																			else { //no "ElasticIP + ElasticLB"		
																																				//create a guest network for basic zone
																																				var array2 = [];
																																				array2.push("&zoneid=" + args.data.returnedZone.id);
																																				array2.push("&name=guestNetworkForBasicZone");
																																				array2.push("&displaytext=guestNetworkForBasicZone");
																																				array2.push("&networkofferingid=" + args.data.zone.networkOfferingId); 
																																				$.ajax({
																																					url: createURL("createNetwork" + array2.join("")),
																																					dataType: "json",
																																					async: false,
																																					success: function(json) {	
																																						//basic zone has only one physical network => addPod() will be called only once => so don't need to double-check before calling addPod()
																																						stepFns.addPod({
																																							data: $.extend(args.data, {
																																								returnedGuestNetwork: json.createnetworkresponse.network
																																							})
																																						});		
																																					}
																																				});
																																			}																																			
																																		}
																																		else if (result.jobstatus == 2) {
																																			alert("failed to enable security group provider. Error: " + fromdb(result.jobresult.errortext));
																																		}
																																	}
																																},
																																error: function(XMLHttpResponse) {
																																	var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																																	alert("failed to enable security group provider. Error: " + errorMsg);
																																}
																															});
																														});
																													}
																												});
																											}					
																											else { //selectedNetworkOfferingHavingSG == false
																												//create a guest network for basic zone
																												var array2 = [];
																												array2.push("&zoneid=" + args.data.returnedZone.id);
																												array2.push("&name=guestNetworkForBasicZone");
																												array2.push("&displaytext=guestNetworkForBasicZone");
																												array2.push("&networkofferingid=" + args.data.zone.networkOfferingId); 
																												$.ajax({
																													url: createURL("createNetwork" + array2.join("")),
																													dataType: "json",
																													async: false,
																													success: function(json) {			
																														//basic zone has only one physical network => addPod() will be called only once => so don't need to double-check before calling addPod()
																														stepFns.addPod({
																															data: $.extend(args.data, {
																																returnedGuestNetwork: json.createnetworkresponse.network
																															})
																														});			
																													}
																												});		
																											}																															  
																										}
																										else if (result.jobstatus == 2) {
																											alert("failed to enable Virtual Router Provider. Error: " + fromdb(result.jobresult.errortext));
																										}
																									}
																								},
																								error: function(XMLHttpResponse) {
																									var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																									alert("failed to enable Virtual Router Provider. Error: " + errorMsg);
																								}
																							});
																						});
																					}
																				});
																			}
																			else if (result.jobstatus == 2) {
																				alert("configureVirtualRouterElement failed. Error: " + fromdb(result.jobresult.errortext));
																			}
																		}
																	},
																	error: function(XMLHttpResponse) {
																		var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																		alert("configureVirtualRouterElement failed. Error: " + errorMsg);
																	}
																});
															});
														}
													});
												}
												else if (result.jobstatus == 2) {
													alert("updatePhysicalNetwork failed. Error: " + fromdb(result.jobresult.errortext));
												}
											}
										},
										error: function(XMLHttpResponse) {
											var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
											alert("updatePhysicalNetwork failed. Error: " + errorMsg);
										}
									});
								});
							}
						});		
					}
          else if(args.data.zone.networkType == "Advanced") {							
						$(args.data.returnedPhysicalNetworks).each(function(){					 
							var thisPhysicalNetwork = this;
							$.ajax({
								url: createURL("updatePhysicalNetwork&state=Enabled&id=" + thisPhysicalNetwork.id),
								dataType: "json",
								success: function(json) {
									var jobId = json.updatephysicalnetworkresponse.jobid;
									var timerKey = "updatePhysicalNetworkJob_"+jobId;
									$("body").everyTime(2000, timerKey, function() {
										$.ajax({
											url: createURL("queryAsyncJobResult&jobId="+jobId),
											dataType: "json",
											success: function(json) {
												var result = json.queryasyncjobresultresponse;
												if (result.jobstatus == 0) {
													return; //Job has not completed
												}
												else {
													$("body").stopTime(timerKey);
													if (result.jobstatus == 1) {
														//alert("updatePhysicalNetwork succeeded.");

														// get network service provider ID of Virtual Router
														var virtualRouterProviderId;
														$.ajax({
															url: createURL("listNetworkServiceProviders&name=VirtualRouter&physicalNetworkId=" + thisPhysicalNetwork.id),
															dataType: "json",
															async: false,
															success: function(json) {
																var items = json.listnetworkserviceprovidersresponse.networkserviceprovider;
																if(items != null && items.length > 0) {
																	virtualRouterProviderId = items[0].id;
																}
															}
														});
														if(virtualRouterProviderId == null) {
															alert("error: listNetworkServiceProviders API doesn't return VirtualRouter provider ID");
															return;
														}

														var virtualRouterElementId;
														$.ajax({
															url: createURL("listVirtualRouterElements&nspid=" + virtualRouterProviderId),
															dataType: "json",
															async: false,
															success: function(json) {
																var items = json.listvirtualrouterelementsresponse.virtualrouterelement;
																if(items != null && items.length > 0) {
																	virtualRouterElementId = items[0].id;
																}
															}
														});
														if(virtualRouterElementId == null) {
															alert("error: listVirtualRouterElements API doesn't return Virtual Router Element Id");
															return;
														}

														$.ajax({
															url: createURL("configureVirtualRouterElement&enabled=true&id=" + virtualRouterElementId),
															dataType: "json",
															async: false,
															success: function(json) {
																var jobId = json.configurevirtualrouterelementresponse.jobid;
																var timerKey = "configureVirtualRouterElementJob_"+jobId;
																$("body").everyTime(2000, timerKey, function() {
																	$.ajax({
																		url: createURL("queryAsyncJobResult&jobId="+jobId),
																		dataType: "json",
																		success: function(json) {
																			var result = json.queryasyncjobresultresponse;
																			if (result.jobstatus == 0) {
																				return; //Job has not completed
																			}
																			else {
																				$("body").stopTime(timerKey);
																				if (result.jobstatus == 1) { //configureVirtualRouterElement succeeded																					
																					$.ajax({
																						url: createURL("updateNetworkServiceProvider&state=Enabled&id=" + virtualRouterProviderId),
																						dataType: "json",
																						async: false,
																						success: function(json) {
																							var jobId = json.updatenetworkserviceproviderresponse.jobid;
																							var timerKey = "updateNetworkServiceProviderJob_"+jobId;
																							$("body").everyTime(2000, timerKey, function() {
																								$.ajax({
																									url: createURL("queryAsyncJobResult&jobId="+jobId),
																									dataType: "json",
																									success: function(json) {
																										var result = json.queryasyncjobresultresponse;
																										if (result.jobstatus == 0) {
																											return; //Job has not completed
																										}
																										else {
																											$("body").stopTime(timerKey);
																											if (result.jobstatus == 1) { //Virtual Router Provider has been enabled successfully		
																												advZoneConfiguredPhysicalNetworkCount++; 																																																						
																												if(advZoneConfiguredPhysicalNetworkCount == args.data.returnedPhysicalNetworks.length) { //not call addPod() until all physical networks get configured
																												  stepFns.addPod({
																														data: args.data
																													});		
																												}	
																											}
																											else if (result.jobstatus == 2) {
																												alert("failed to enable Virtual Router Provider. Error: " + fromdb(result.jobresult.errortext));
																											}
																										}
																									},
																									error: function(XMLHttpResponse) {
																										var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																										alert("updateNetworkServiceProvider failed. Error: " + errorMsg);
																									}
																								});
																							});
																						}
																					});
																				}
																				else if (result.jobstatus == 2) {
																					alert("configureVirtualRouterElement failed. Error: " + fromdb(result.jobresult.errortext));
																				}
																			}
																		},
																		error: function(XMLHttpResponse) {
																			var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																			alert("configureVirtualRouterElement failed. Error: " + errorMsg);
																		}
																	});
																});
															}
														});
													}
													else if (result.jobstatus == 2) {
														alert("updatePhysicalNetwork failed. Error: " + fromdb(result.jobresult.errortext));
													}
												}
											},
											error: function(XMLHttpResponse) {
												var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
												alert("updatePhysicalNetwork failed. Error: " + errorMsg);
											}
										});
									});
								}
							});							
						});		
          }						
				},
				
				addNetscalerDevice: function(args) {
				  message('Adding Netscaler device');
				 					
					var array1 = [];
					array1.push("&physicalnetworkid=" + args.data.returnedBasicPhysicalNetwork.id);
					array1.push("&username=" + todb(args.data.basicPhysicalNetwork.username));
					array1.push("&password=" + todb(args.data.basicPhysicalNetwork.password));
					array1.push("&networkdevicetype=" + todb(args.data.basicPhysicalNetwork.networkdevicetype));

					//construct URL starts here
					var url = [];

					var ip = args.data.basicPhysicalNetwork.ip;
					url.push("https://" + ip);

					var isQuestionMarkAdded = false;

					var publicInterface = args.data.basicPhysicalNetwork.publicinterface;
					if(publicInterface != null && publicInterface.length > 0) {
							if(isQuestionMarkAdded == false) {
									url.push("?");
									isQuestionMarkAdded = true;
							}
							else {
									url.push("&");
							}
							url.push("publicinterface=" + publicInterface);
					}

					var privateInterface = args.data.basicPhysicalNetwork.privateinterface;
					if(privateInterface != null && privateInterface.length > 0) {
							if(isQuestionMarkAdded == false) {
									url.push("?");
									isQuestionMarkAdded = true;
							}
							else {
									url.push("&");
							}
							url.push("privateinterface=" + privateInterface);
					}

					var numretries = args.data.basicPhysicalNetwork.numretries;
					if(numretries != null && numretries.length > 0) {
							if(isQuestionMarkAdded == false) {
									url.push("?");
									isQuestionMarkAdded = true;
							}
							else {
									url.push("&");
							}
							url.push("numretries=" + numretries);
					}

					var isInline = args.data.basicPhysicalNetwork.inline;
					if(isInline != null && isInline.length > 0) {
							if(isQuestionMarkAdded == false) {
									url.push("?");
									isQuestionMarkAdded = true;
							}
							else {
									url.push("&");
							}
							url.push("inline=" + isInline);
					}

					var capacity = args.data.basicPhysicalNetwork.capacity;
					if(capacity != null && capacity.length > 0) {
							if(isQuestionMarkAdded == false) {
									url.push("?");
									isQuestionMarkAdded = true;
							}
							else {
									url.push("&");
							}
							url.push("lbdevicecapacity=" + capacity);
					}

					var dedicated = (args.data.basicPhysicalNetwork.dedicated == "on");	//boolean	(true/false)
					if(isQuestionMarkAdded == false) {
							url.push("?");
							isQuestionMarkAdded = true;
					}
					else {
							url.push("&");
					}
					url.push("lbdevicededicated=" + dedicated.toString());


					array1.push("&url=" + todb(url.join("")));
					//construct URL ends here

					$.ajax({
						url: createURL("addNetscalerLoadBalancer" + array1.join("")),
						dataType: "json",
						success: function(json) {																																													
							var addNetscalerLoadBalancerTimer = "asyncJob_" + json.addnetscalerloadbalancerresponse.jobid;																																													
							$("body").everyTime(2000, addNetscalerLoadBalancerTimer, function() {
								$.ajax({
									url: createURL("queryAsyncJobResult&jobid=" + json.addnetscalerloadbalancerresponse.jobid),
									dataType: "json",
									success: function(json) {
										var result = json.queryasyncjobresultresponse;																																																
										if(result.jobstatus == 0) {
											return;
										}
										else {
											$("body").stopTime(addNetscalerLoadBalancerTimer);
											if(result.jobstatus == 1) {																																																		
												args.data.returnedNetscalerProvider.returnedNetscalerloadbalancer = result.jobresult.netscalerloadbalancer;																				
																																																														
												$.ajax({
													url: createURL("updateNetworkServiceProvider&state=Enabled&id=" + args.data.returnedNetscalerProvider.id),
													dataType: "json",
													success: function(json) {
														var updateNetworkServiceProviderTimer = "asyncJob_" + json.updatenetworkserviceproviderresponse.jobid;
														
														$("body").everyTime(2000, updateNetworkServiceProviderTimer, function() {
															$.ajax({
																url: createURL("queryAsyncJobResult&jobid=" + json.updatenetworkserviceproviderresponse.jobid),
																dataType: "json",
																success: function(json) {
																	var result = json.queryasyncjobresultresponse;
																	if(result.jobstatus == 0) {
																		return;
																	}
																	else {
																		$("body").stopTime(updateNetworkServiceProviderTimer);
																		if(result.jobstatus == 1) {																																																																																																																
																			//create a guest network for basic zone
																			var array2 = [];
																			array2.push("&zoneid=" + args.data.returnedZone.id);
																			array2.push("&name=guestNetworkForBasicZone");
																			array2.push("&displaytext=guestNetworkForBasicZone");
																			array2.push("&networkofferingid=" + args.data.zone.networkOfferingId); 
																			$.ajax({
																				url: createURL("createNetwork" + array2.join("")),
																				dataType: "json",
																				async: false,
																				success: function(json) {	
																					//basic zone has only one physical network => addPod() will be called only once => so don't need to double-check before calling addPod()
																					stepFns.addPod({
																						data: $.extend(args.data, {
																							returnedGuestNetwork: json.createnetworkresponse.network
																						})
																					});		
																				},																																																									
																				error: function(XMLHttpResponse) {
																					var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
																					alert("failed to create a guest network for basic zone. Error: " + errorMsg);
																				}																																																										
																			});																																																				
																		}
																		else if(result.jobstatus == 2) {
																			alert("failed to enable Netscaler provider. Error: " + fromdb(result.jobresult.errortext));
																		}															
																	}													
																}
															});											
														});
													},
													error: function(XMLHttpResponse) {
														var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
														alert("failed to enable Netscaler provider. Error: " + errorMsg);
													}
												});																																																		
											}
											else if(result.jobstatus == 2) {  //addNetscalerLoadBalancer failed																																																												  
												error('addNetscalerDevice', fromdb(result.jobresult.errortext), { fn: 'addNetscalerDevice', args: args });
											}
										}							
									}																					
								});
							});				
						},						
						error: function(XMLHttpResponse) {
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addNetscalerDevice', errorMsg, { fn: 'addNetscalerDevice', args: args });
						}		
					});					
				},
				
        addPod: function(args) {	          	  
          message('Creating pod');
                   
					var array3 = [];
					array3.push("&zoneId=" + args.data.returnedZone.id);
					array3.push("&name=" + todb(args.data.pod.name));
					array3.push("&gateway=" + todb(args.data.pod.reservedSystemGateway));
					array3.push("&netmask=" + todb(args.data.pod.reservedSystemNetmask));
					array3.push("&startIp=" + todb(args.data.pod.reservedSystemStartIp));

					var endip = args.data.pod.reservedSystemEndIp;      //optional
					if (endip != null && endip.length > 0)
						array3.push("&endIp=" + todb(endip));

					$.ajax({
						url: createURL("createPod" + array3.join("")),
						dataType: "json",
						async: false,
						success: function(json) {		              					
							stepFns.configurePublicTraffic({
								data: $.extend(args.data, {
									returnedPod: json.createpodresponse.pod
								})
							});		
						},
						error: function(XMLHttpResponse) {
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addPod', errorMsg, { fn: 'addPod', args: args });
						}
					}); 						
        },  
       			
        configurePublicTraffic: function(args) {		          
					if((args.data.zone.networkType == "Basic" && (selectedNetworkOfferingHavingSG == true && selectedNetworkOfferingHavingEIP == true && selectedNetworkOfferingHavingELB == true))
					 ||(args.data.zone.networkType == "Advanced")) {	
					 
						message('Configuring public traffic');
           
					  var stopNow = false;
												
            $(args.data.publicTraffic).each(function(){		
						  var thisPublicVlanIpRange = this;
						  
              //check whether the VlanIpRange exists or not (begin)
							var isExisting = false;
							$(returnedPublicVlanIpRanges).each(function() {							 
							  if(this.vlan == thisPublicVlanIpRange.vlanid && this.startip == thisPublicVlanIpRange.startip && this.netmask == thisPublicVlanIpRange.netmask && this.gateway == thisPublicVlanIpRange.gateway) {
								  isExisting = true;
									return false; //break each loop									
								}
							});
						  if(isExisting == true)
							  return; //skip current item to next item (continue each loop)
						
						  //check whether the VlanIpRange exists or not (end)
						
							var array1 = [];
							array1.push("&zoneId=" + args.data.returnedZone.id);

							if (this.vlanid != null && this.vlanid.length > 0)
								array1.push("&vlan=" + todb(this.vlanid));
							else
								array1.push("&vlan=untagged");

							array1.push("&gateway=" + this.gateway);
							array1.push("&netmask=" + this.netmask);
							array1.push("&startip=" + this.startip);
							if(this.endip != null && this.endip.length > 0)
								array1.push("&endip=" + this.endip);

							array1.push("&forVirtualNetwork=true");
						
							$.ajax({
								url: createURL("createVlanIpRange" + array1.join("")),
								dataType: "json",
								async: false,
								success: function(json) {	
									var item = json.createvlaniprangeresponse.vlan;
									returnedPublicVlanIpRanges.push(item);                  
								},
								error: function(XMLHttpResponse) {	                 				  
									var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
									error('configurePublicTraffic', errorMsg, { fn: 'configurePublicTraffic', args: args });
									stopNow = true;
								}
							});		

							if(stopNow == true) 
							  return false; //break each loop, don't create next VlanIpRange	
								
						});				
												
            if(stopNow == true)
						  return; //stop the whole process
						
						stepFns.configureGuestTraffic({
							data: $.extend(args.data, {
								returnedPublicTraffic: returnedPublicVlanIpRanges
							})
						});								
					}
					else { //basic zone without public traffic type , skip to next step
					  stepFns.configureGuestTraffic({
							data: args.data
						});		
					}
        },    
				
        configureGuestTraffic: function(args) {
          message('Configuring guest traffic');
      
					if(args.data.returnedZone.networktype == "Basic") {		//create an VlanIpRange for guest network in basic zone		
            var array1 = [];												
						array1.push("&podid=" + args.data.returnedPod.id); 
						array1.push("&networkid=" + args.data.returnedGuestNetwork.id); 
						array1.push("&gateway=" + args.data.guestTraffic.guestGateway);
						array1.push("&netmask=" + args.data.guestTraffic.guestNetmask);
						array1.push("&startip=" + args.data.guestTraffic.guestStartIp);
						if(args.data.guestTraffic.guestEndIp != null && args.data.guestTraffic.guestEndIp.length > 0)
							array1.push("&endip=" + args.data.guestTraffic.guestEndIp);
						array1.push("&forVirtualNetwork=false"); //indicates this new IP range is for guest network, not public network	
					
						$.ajax({
							url: createURL("createVlanIpRange" + array1.join("")),
							dataType: "json",							
							success: function(json) {	
								args.data.returnedGuestNetwork.returnedVlanIpRange = json.createvlaniprangeresponse.vlan;
                stepFns.addCluster({
									data: args.data
								});								
							},
							error: function(XMLHttpResponse) {							  
								var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
								error('configureGuestTraffic', errorMsg, { fn: 'configureGuestTraffic', args: args });
							}
						});	 
					}
					else if(args.data.returnedZone.networktype == "Advanced") {	 //update VLAN in physical network(s) in advanced zone   	
						var physicalNetworksHavingGuest = [];
						$(args.data.physicalNetworks).each(function(){		
						  if(this.guestConfiguration != null) {		
						    physicalNetworksHavingGuest.push(this);
						  }
						});
						
						var updatedCount = 0;
            $(physicalNetworksHavingGuest).each(function(){
							var vlan;
							if(this.guestConfiguration.vlanRangeEnd == null || this.guestConfiguration.vlanRangeEnd.length == 0)
								vlan = this.guestConfiguration.vlanRangeStart;
							else
								vlan = this.guestConfiguration.vlanRangeStart + "-" + this.guestConfiguration.vlanRangeEnd;
							
							var originalId = this.id;
							var returnedId;
							$(args.data.returnedPhysicalNetworks).each(function(){								  
								if(this.originalId == originalId) {
									returnedId = this.id;
									return false; //break the loop
								}
							});
							
							$.ajax({
								url: createURL("updatePhysicalNetwork&id=" + returnedId  + "&vlan=" + todb(vlan)), 
								dataType: "json",
								success: function(json) {
									var jobId = json.updatephysicalnetworkresponse.jobid;							
									var timerKey = "asyncJob_" + jobId;							
									$("body").everyTime(2000, timerKey, function(){
										$.ajax({
											url: createURL("queryAsyncJobResult&jobid=" + jobId),
											dataType: "json",
											success: function(json) {									
												var result = json.queryasyncjobresultresponse;												
												if(result.jobstatus == 0) {
													return;
												}
												else {
													$("body").stopTime(timerKey);
													if(result.jobstatus == 1) {	
														updatedCount++;
														if(updatedCount == physicalNetworksHavingGuest.length) {															
															stepFns.addCluster({
																data: args.data
															});
														}
													}
													else if(result.jobstatus == 2){
														alert("error: " + fromdb(result.jobresult.errortext));
													}
												}										
											},	
											error: function(XMLHttpResponse) {
												var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
												error('configureGuestTraffic', errorMsg, { fn: 'configureGuestTraffic', args: args });
											}		
										});
									});								
								}
							});		
            });			
					}					
        },
        				
        addCluster: function(args) {
          message('Creating cluster');
          					
					var array1 = [];
					array1.push("&zoneId=" + args.data.returnedZone.id);
					array1.push("&hypervisor=" + args.data.cluster.hypervisor);

					var clusterType;
					if(args.data.cluster.hypervisor == "VMware")
						clusterType="ExternalManaged";
					else
						clusterType="CloudManaged";
					array1.push("&clustertype=" + clusterType);

					array1.push("&podId=" + args.data.returnedPod.id);

					var clusterName = args.data.cluster.name;
					
					if(args.data.cluster.hypervisor == "VMware") {
						array1.push("&username=" + todb(args.data.cluster.vCenterUsername));
						array1.push("&password=" + todb(args.data.cluster.vCenterPassword));

						var hostname = args.data.cluster.vCenterHost;
						var dcName = args.data.cluster.vCenterDatacenter;

						var url;
						if(hostname.indexOf("http://") == -1)
							url = "http://" + hostname;
						else
							url = hostname;
						url += "/" + dcName + "/" + clusterName;
						array1.push("&url=" + todb(url));

						clusterName = hostname + "/" + dcName + "/" + clusterName; //override clusterName
					}
					array1.push("&clustername=" + todb(clusterName));

					$.ajax({
						url: createURL("addCluster" + array1.join("")),
						dataType: "json",
						async: true,
						success: function(json) {								  
							if(args.data.cluster.hypervisor != "VMware") {
								stepFns.addHost({
									data: $.extend(args.data, {
										returnedCluster: json.addclusterresponse.cluster[0]
									})
								});
							}
							else { //args.groupedData.cluster.hypervisor == "VMware", skip add host step					  
								stepFns.addPrimaryStorage({
									data: $.extend(args.data, {
										returnedCluster: json.addclusterresponse.cluster[0]
									})
								});
							}
						},
						error: function(XMLHttpResponse) {
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addCluster', errorMsg, { fn: 'addCluster', args: args });
						}
					});		
        },
        
        addHost: function(args) {
          message('Adding host');
					         		
					var array1 = [];
					array1.push("&zoneid=" + args.data.returnedZone.id);
					array1.push("&podid=" + args.data.returnedPod.id);
					array1.push("&clusterid=" + args.data.returnedCluster.id);
					array1.push("&hypervisor=" + todb(args.data.cluster.hypervisor));
					var clustertype = args.data.returnedCluster.clustertype;
					array1.push("&clustertype=" + todb(clustertype));
					array1.push("&hosttags=" + todb(args.data.host.hosttags));

					if(args.data.cluster.hypervisor == "VMware") {
						array1.push("&username=");
						array1.push("&password=");
						var hostname = args.data.host.vcenterHost;
						var url;
						if(hostname.indexOf("http://")==-1)
							url = "http://" + hostname;
						else
							url = hostname;
						array1.push("&url=" + todb(url));
					}
					else {
						array1.push("&username=" + todb(args.data.host.username));
						array1.push("&password=" + todb(args.data.host.password));

						var hostname = args.data.host.hostname;

						var url;
						if(hostname.indexOf("http://")==-1)
							url = "http://" + hostname;
						else
							url = hostname;
						array1.push("&url="+todb(url));

						if (args.data.cluster.hypervisor == "BareMetal") {
							array1.push("&cpunumber=" + todb(args.data.host.baremetalCpuCores));
							array1.push("&cpuspeed=" + todb(args.data.host.baremetalCpu));
							array1.push("&memory=" + todb(args.data.host.baremetalMemory));
							array1.push("&hostmac=" + todb(args.data.host.baremetalMAC));
						}
						else if(args.data.cluster.hypervisor == "Ovm") {
							array1.push("&agentusername=" + todb(args.data.host.agentUsername));
							array1.push("&agentpassword=" + todb(args.data.host.agentPassword));
						}
					}

					$.ajax({
						url: createURL("addHost" + array1.join("")),
						dataType: "json",
						success: function(json) {			
							stepFns.addPrimaryStorage({
								data: $.extend(args.data, {
									returnedHost: json.addhostresponse.host[0]
								})
							});														
						},
						error: function(XMLHttpResponse) {
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addHost', errorMsg, { fn: 'addHost', args: args });
						}
					});					    
        },
        
        addPrimaryStorage: function(args) {
          message('Creating primary storage');
					
					var array1 = [];
					array1.push("&zoneid=" + args.data.returnedZone.id);
					array1.push("&podId=" + args.data.returnedPod.id);
					array1.push("&clusterid=" + args.data.returnedCluster.id);
					array1.push("&name=" + todb(args.data.primaryStorage.name));

					var server = args.data.primaryStorage.server;
					var url = null;
					if (args.data.primaryStorage.protocol == "nfs") {
						//var path = trim($thisDialog.find("#add_pool_path").val());
						var path = args.data.primaryStorage.path;

						if(path.substring(0,1) != "/")
							path = "/" + path;
						url = nfsURL(server, path);
					}
					else if (args.data.primaryStorage.protocol == "PreSetup") {
						//var path = trim($thisDialog.find("#add_pool_path").val());
						var path = args.data.primaryStorage.path;

						if(path.substring(0,1) != "/")
							path = "/" + path;
						url = presetupURL(server, path);
					}
					else if (args.data.primaryStorage.protocol == "ocfs2") {
						//var path = trim($thisDialog.find("#add_pool_path").val());
						var path = args.data.primaryStorage.path;

						if(path.substring(0,1) != "/")
							path = "/" + path;
						url = ocfs2URL(server, path);
					}
					else if (args.data.primaryStorage.protocol == "SharedMountPoint") {
						//var path = trim($thisDialog.find("#add_pool_path").val());
						var path = args.data.primaryStorage.path;

						if(path.substring(0,1) != "/")
							path = "/" + path;
						url = SharedMountPointURL(server, path);
					}										
					else if (args.data.primaryStorage.protocol == "clvm") {
						//var vg = trim($thisDialog.find("#add_pool_clvm_vg").val());						
						var vg = args.data.primaryStorage.volumegroup;
						
						if(vg.substring(0,1) != "/")
							vg = "/" + vg;									
						url = clvmURL(vg);
					}					
					else if (args.data.primaryStorage.protocol == "vmfs") {
						//var path = trim($thisDialog.find("#add_pool_vmfs_dc").val());
						var path = args.data.primaryStorage.vCenterDataCenter;

						if(path.substring(0,1) != "/")
							path = "/" + path;
						path += "/" + args.data.primaryStorage.vCenterDataStore;
						url = vmfsURL("dummy", path);
					}
					else {
						//var iqn = trim($thisDialog.find("#add_pool_iqn").val());
						var iqn = args.data.primaryStorage.iqn;

						if(iqn.substring(0,1) != "/")
							iqn = "/" + iqn;
						var lun = args.data.primaryStorage.lun;
						url = iscsiURL(server, iqn, lun);
					}
					array1.push("&url=" + todb(url));

					if(args.data.primaryStorage.storageTags != null && args.data.primaryStorage.storageTags.length > 0)
						array1.push("&tags=" + todb(args.data.primaryStorage.storageTags));

					$.ajax({
						url: createURL("createStoragePool" + array1.join("")),
						dataType: "json",
						success: function(json) {									
							stepFns.addSecondaryStorage({
								data: $.extend(args.data, {
								  returnedPrimaryStorage: json.createstoragepoolresponse.storagepool
								})
							});
						},
						error: function(XMLHttpResponse) {
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addPrimaryStorage', errorMsg, { fn: 'addPrimaryStorage', args: args });
						}
					});					
        },
        
        addSecondaryStorage: function(args) {
          message('Creating secondary storage');
          							
					var nfs_server = args.data.secondaryStorage.nfsServer;
					var path = args.data.secondaryStorage.path;
					var url = nfsURL(nfs_server, path);

					$.ajax({
						url: createURL("addSecondaryStorage&zoneId=" + args.data.returnedZone.id + "&url=" + todb(url)),
						dataType: "json",
						success: function(json) {													
							complete({
								data: $.extend(args.data, {
								  returnedSecondaryStorage: json.addsecondarystorageresponse.secondarystorage
								})
							});							
						},
						error: function(XMLHttpResponse) {
							var errorMsg = parseXMLHttpResponse(XMLHttpResponse);
							error('addSecondaryStorage', errorMsg, { fn: 'addSecondaryStorage', args: args });
						}
					});					
        }
      };

      var complete = function(args) {			
        message('Zone creation complete!');
        success(args);
      };
      
      if (startFn) {
        stepFns[startFn.fn]({
          data: $.extend(startFn.args.data, data)
        });
      } else {
        stepFns.addZone({});
      }
    },

    enableZoneAction: function(args) {		 
		  $.ajax({
			  url: createURL("updateZone&allocationstate=Enabled&id=" + args.launchData.returnedZone.id),
				dataType: "json",
				success: function(json) {				  
					args.formData.returnedZone = json.updatezoneresponse.zone;
					args.response.success();
				}			
			});		      
    }
  };
}(cloudStack, jQuery));
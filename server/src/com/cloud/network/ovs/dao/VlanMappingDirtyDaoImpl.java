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
package com.cloud.network.ovs.dao;

import javax.ejb.Local;

import com.cloud.utils.db.GenericDaoBase;
import com.cloud.utils.db.SearchBuilder;
import com.cloud.utils.db.SearchCriteria;
import com.cloud.utils.db.SearchCriteria.Op;

@Local(value = { VlanMappingDirtyDao.class })
public class VlanMappingDirtyDaoImpl extends
		GenericDaoBase<VlanMappingDirtyVO, Long> implements VlanMappingDirtyDao {
	protected final SearchBuilder<VlanMappingDirtyVO> AccountIdSearch;
	
	public VlanMappingDirtyDaoImpl() {
		super();
		AccountIdSearch = createSearchBuilder();
		AccountIdSearch.and("account_id", AccountIdSearch.entity().getAccountId(), Op.EQ);
		AccountIdSearch.done();
	}
	
	@Override
	public boolean isDirty(long accountId) {
		SearchCriteria<VlanMappingDirtyVO> sc = AccountIdSearch.create();
        sc.setParameters("account_id", accountId);
		VlanMappingDirtyVO vo = findOneBy(sc);
		if (vo == null) {
			return false;
		}
		return vo.isDirty();
	}

	@Override
	public void markDirty(long accountId) {
		SearchCriteria<VlanMappingDirtyVO> sc = AccountIdSearch.create();
        sc.setParameters("account_id", accountId);
		VlanMappingDirtyVO vo = findOneBy(sc);
		if (vo == null) {
			vo = new VlanMappingDirtyVO(accountId, true);
			persist(vo);
		} else {
			vo.markDirty();
			update(vo, sc);
		}
	}

	@Override
	public void clean(long accountId) {
		SearchCriteria<VlanMappingDirtyVO> sc = AccountIdSearch.create();
        sc.setParameters("account_id", accountId);
		VlanMappingDirtyVO vo = findOneBy(sc);
		if (vo == null) {
			vo = new VlanMappingDirtyVO(accountId, false);
			persist(vo);
		} else {
			vo.clean();
			update(vo, sc);
		}
	}

}
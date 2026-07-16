package com.erp.settings.service;

import com.erp.common.ApiException;
import com.erp.settings.domain.CodeGroup;
import com.erp.settings.domain.CommonCode;
import com.erp.settings.dto.CommonCodeDtos.CodeGroupResponse;
import com.erp.settings.dto.CommonCodeDtos.CodeResponse;
import com.erp.settings.dto.CommonCodeDtos.CreateCodeRequest;
import com.erp.settings.dto.CommonCodeDtos.CreateGroupRequest;
import com.erp.settings.dto.CommonCodeDtos.UpdateCodeRequest;
import com.erp.settings.repository.CodeGroupRepository;
import com.erp.settings.repository.CommonCodeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.settings.dto.CommonCodeDtos;

/**
 * 공통코드. 카드사·결제대행사·추가항목유형처럼 "그냥 목록"인 값들을 한 곳에서 관리한다.
 *
 * <p>로직을 태우는 값(전표 상태·소득구분 등)은 여기로 옮기지 않는다. 코드가 그 값으로
 * 분기하므로 테이블로 빼면 로직이 데이터 속에 숨어버린다. 여기 담는 것은 목록뿐이다.
 */
@Service
@RequiredArgsConstructor
public class CommonCodeService {

    private final CodeGroupRepository groupRepository;
    private final CommonCodeRepository codeRepository;

    @Transactional(readOnly = true)
    public List<CodeGroupResponse> findAll() {
        return groupRepository.findAllWithCodes().stream()
                .map(CodeGroupResponse::from)
                .toList();
    }

    /** 화면이 그룹코드로 목록을 가져가는 진입점 (예: CARD_COMPANY) */
    @Transactional(readOnly = true)
    public List<CodeResponse> findByGroupCode(String groupCode) {
        CodeGroup g = groupRepository.findByGroupCode(groupCode)
                .orElseThrow(() -> ApiException.notFound("코드 그룹을 찾을 수 없습니다: " + groupCode));
        return CodeGroupResponse.from(g).codes().stream()
                .filter(CodeResponse::active)
                .toList();
    }

    @Transactional
    public CodeGroupResponse createGroup(CreateGroupRequest req) {
        String groupCode = req.groupCode().trim().toUpperCase();
        if (groupRepository.existsByGroupCode(groupCode)) {
            throw ApiException.conflict("이미 존재하는 그룹코드입니다: " + groupCode);
        }
        CodeGroup g = CodeGroup.builder()
                .groupCode(groupCode)
                .name(req.name().trim())
                .description(req.description())
                .system(false)   // 사용자가 만든 그룹은 시스템 그룹이 아니다
                .active(true)
                .build();
        return CodeGroupResponse.from(groupRepository.save(g));
    }

    /** 시스템 그룹은 화면이 그룹코드로 찾으므로 지울 수 없다. */
    @Transactional
    public void deleteGroup(Long id) {
        CodeGroup g = getGroup(id);
        if (g.isSystem()) {
            throw ApiException.conflict("시스템 코드 그룹은 삭제할 수 없습니다: " + g.getGroupCode());
        }
        groupRepository.delete(g);
    }

    @Transactional
    public CodeResponse addCode(Long groupId, CreateCodeRequest req) {
        CodeGroup g = getGroup(groupId);
        String code = req.code().trim().toUpperCase();
        if (codeRepository.existsByGroupIdAndCode(groupId, code)) {
            throw ApiException.conflict(g.getName() + " 그룹에 이미 있는 코드입니다: " + code);
        }
        CommonCode c = CommonCode.builder()
                .group(g)
                .code(code)
                .name(req.name().trim())
                .value1(req.value1())
                .value2(req.value2())
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .remark(req.remark())
                .build();
        g.getCodes().add(c);
        return CodeResponse.from(codeRepository.save(c));
    }

    @Transactional
    public CodeResponse updateCode(Long id, UpdateCodeRequest req) {
        CommonCode c = getCode(id);
        c.setName(req.name().trim());
        c.setValue1(req.value1());
        c.setValue2(req.value2());
        if (req.sortOrder() != null) c.setSortOrder(req.sortOrder());
        if (req.active() != null) c.setActive(req.active());
        c.setRemark(req.remark());
        return CodeResponse.from(c);
    }

    @Transactional
    public void deleteCode(Long id) {
        codeRepository.delete(getCode(id));
    }

    private CodeGroup getGroup(Long id) {
        return groupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("코드 그룹을 찾을 수 없습니다. id=" + id));
    }

    private CommonCode getCode(Long id) {
        return codeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("코드를 찾을 수 없습니다. id=" + id));
    }
}

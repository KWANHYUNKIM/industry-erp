package com.erp.settings.collectdata;

import com.erp.common.ApiException;
import com.erp.settings.collectdata.dto.CollectDataDtos.CollectDataResponse;
import com.erp.settings.collectdata.dto.CollectDataDtos.CreateCollectDataRequest;
import com.erp.settings.collectdata.dto.CollectDataDtos.UpdateCollectDataRequest;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 데이터센터 › 수집데이터등록(C001401). */
@Service
@RequiredArgsConstructor
public class CollectDataService {

    /** 원본 알림 창의 [사유] 그대로(2026-10-03 loginaa 실측). */
    static final String DUPLICATE = "이미 수집데이터등록에 존재하는 수집 대상입니다. 수집대상 확인 후 재시도 바랍니다.";

    private final CollectDataRepository repository;

    @Transactional(readOnly = true)
    public List<CollectDataResponse> findAll() {
        return repository.findAllByOrderByBuiltInDescIdAsc().stream()
                .map(CollectDataResponse::from).toList();
    }

    /** 신규 창이 미리 채워 두는 [데이터코드] — 원본은 00001 부터 다섯 자리. */
    @Transactional(readOnly = true)
    public String nextCode() {
        int max = repository.findAll().stream()
                .map(CollectData::getCode)
                .filter(c -> c != null && c.matches("\\d+"))
                .mapToInt(Integer::parseInt).max().orElse(0);
        return String.format("%05d", max + 1);
    }

    @Transactional
    public CollectDataResponse create(CreateCollectDataRequest req, String user) {
        String sender = blankToNull(req.senderCompany());
        rejectDuplicate(req.docType(), sender, null);
        String code = blankToNull(req.code());
        if (code == null) code = nextCode();
        String finalCode = code;
        if (repository.findAll().stream().anyMatch(d -> finalCode.equals(d.getCode()))) {
            throw ApiException.conflict("이미 사용 중인 데이터코드입니다. (" + code + ")");
        }
        CollectData d = CollectData.builder()
                .code(code)
                .name(req.name().trim())
                .docType(req.docType())
                .senderCompany(sender)
                .createdBy(user)
                .updatedBy(user)
                .build();
        return CollectDataResponse.from(repository.save(d));
    }

    @Transactional
    public CollectDataResponse update(Long id, UpdateCollectDataRequest req, String user) {
        CollectData d = get(id);
        rejectBuiltIn(d);
        String sender = blankToNull(req.senderCompany());
        rejectDuplicate(d.getDocType(), sender, d.getId());
        d.setName(req.name().trim());
        d.setSenderCompany(sender);
        d.setUpdatedBy(user);
        return CollectDataResponse.from(d);
    }

    @Transactional
    public void delete(Long id) {
        CollectData d = get(id);
        rejectBuiltIn(d);
        repository.delete(d);
    }

    /** 같은 수신문서 · 같은 보낸회사면 같은 수집 대상이다(보낸회사를 비운 줄끼리도). */
    private void rejectDuplicate(CollectDocType docType, String sender, Long selfId) {
        boolean dup = repository.findByDocType(docType).stream()
                .filter(o -> !o.getId().equals(selfId))
                .anyMatch(o -> Objects.equals(blankToNull(o.getSenderCompany()), sender));
        if (dup) throw ApiException.conflict(DUPLICATE);
    }

    /** 원본은 기본 줄의 이름이 링크가 아니고 체크박스도 막혀 있다 — 열 수도 지울 수도 없다. */
    private void rejectBuiltIn(CollectData d) {
        if (d.isBuiltIn()) {
            throw ApiException.badRequest("기본 수집데이터는 수정하거나 삭제할 수 없습니다.");
        }
    }

    private CollectData get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수집데이터를 찾을 수 없습니다. id=" + id));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}

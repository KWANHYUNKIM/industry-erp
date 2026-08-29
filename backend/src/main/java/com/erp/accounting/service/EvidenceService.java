package com.erp.accounting.service;

import com.erp.accounting.domain.EvidenceAttachment;
import com.erp.accounting.domain.enums.EvidenceMethod;
import com.erp.accounting.dto.EvidenceDtos.EvidenceResponse;
import com.erp.accounting.repository.EvidenceAttachmentRepository;
import com.erp.common.ApiException;
import com.erp.common.FileStorageService;
import com.erp.common.StoredFile;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/**
 * 증빙센터(E040730). 전표에 붙은 증빙을 기간·메뉴·작업자·증빙방법·첨부여부로 훑는다.
 *
 * 원본의 '전자서명' 조건은 우리에게 전자서명 기능이 없어 넣지 않았다 — 값이 없는 컨트롤은 만들지 않는다.
 */
@Service
@RequiredArgsConstructor
public class EvidenceService {

    private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(2999, 12, 31);
    private static final Set<String> ENTITY_TYPES = Set.of("SALES", "PURCHASE", "EXPENSE");

    private final EvidenceAttachmentRepository repository;
    private final FileStorageService fileStorage;

    /**
     * 증빙센터 목록.
     *
     * @param attached null=전체 · true=증빙첨부 있음 · false=없음
     */
    @Transactional(readOnly = true)
    public List<EvidenceResponse> search(LocalDate from, LocalDate to,
                                         LocalDate evidenceFrom, LocalDate evidenceTo,
                                         String entityType, String worker,
                                         EvidenceMethod method, Boolean attached) {
        return repository.findInPeriod(from != null ? from : MIN_DATE, to != null ? to : MAX_DATE).stream()
                .filter(e -> evidenceFrom == null || (e.getEvidenceDate() != null && !e.getEvidenceDate().isBefore(evidenceFrom)))
                .filter(e -> evidenceTo == null || (e.getEvidenceDate() != null && !e.getEvidenceDate().isAfter(evidenceTo)))
                .filter(e -> !StringUtils.hasText(entityType) || entityType.equals(e.getEntityType()))
                .filter(e -> !StringUtils.hasText(worker) || worker.equals(e.getWorker()))
                .filter(e -> method == null || method == e.getMethod())
                .filter(e -> attached == null || attached == (e.getFile() != null))
                .map(EvidenceResponse::from)
                .toList();
    }

    /** 전표 상세 패널용 */
    @Transactional(readOnly = true)
    public List<EvidenceResponse> byTarget(String entityType, Long entityId) {
        return repository.findByTarget(entityType, entityId).stream().map(EvidenceResponse::from).toList();
    }

    /** 증빙 등록. 파일은 선택(증빙방법만 기록해 둘 수도 있다). */
    @Transactional
    public EvidenceResponse create(String entityType, Long entityId, String docNo,
                                   LocalDate docDate, LocalDate evidenceDate,
                                   EvidenceMethod method, String note,
                                   MultipartFile file, String worker) {
        if (!ENTITY_TYPES.contains(entityType)) {
            throw ApiException.badRequest("지원하지 않는 전표 종류입니다: " + entityType + " (SALES/PURCHASE/EXPENSE)");
        }
        if (entityId == null) {
            throw ApiException.badRequest("증빙을 붙일 전표를 지정하세요.");
        }
        StoredFile stored = (file != null && !file.isEmpty()) ? fileStorage.store(file, worker) : null;
        /* 붙는 순간 이 파일의 주인을 적는다 — 내려받기를 이 코드로 막는다. */
        if (stored != null) stored.setOwnerCode("ACCOUNTING");

        EvidenceAttachment e = EvidenceAttachment.builder()
                .entityType(entityType)
                .entityId(entityId)
                .docNo(docNo)
                .docDate(docDate != null ? docDate : LocalDate.now())
                .evidenceDate(evidenceDate)
                .method(method != null ? method : EvidenceMethod.ETC)
                .worker(worker)
                .note(note)
                .file(stored)
                .build();
        return EvidenceResponse.from(repository.save(e));
    }

    /** 증빙 삭제. 붙어 있던 파일도 함께 지운다. */
    @Transactional
    public void delete(Long id) {
        EvidenceAttachment e = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("증빙을 찾을 수 없습니다. id=" + id));
        Long fileId = e.getFile() != null ? e.getFile().getId() : null;
        repository.delete(e);
        if (fileId != null) {
            fileStorage.delete(fileId);
        }
    }

    /** 목록의 작업자 콤보용 */
    @Transactional(readOnly = true)
    public List<String> workers() {
        return repository.findInPeriod(MIN_DATE, MAX_DATE).stream()
                .map(EvidenceAttachment::getWorker)
                .filter(StringUtils::hasText)
                .distinct()
                .sorted()
                .toList();
    }
}

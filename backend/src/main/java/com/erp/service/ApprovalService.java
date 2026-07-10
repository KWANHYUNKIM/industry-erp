package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.ApprovalDocument;
import com.erp.domain.ApprovalDocumentVoucher;
import com.erp.domain.ApprovalFormTemplate;
import com.erp.domain.ApprovalLine;
import com.erp.domain.ApprovalLineStatus;
import com.erp.domain.ApprovalParticipant;
import com.erp.domain.ApprovalParticipantRole;
import com.erp.domain.ApprovalStatus;
import com.erp.domain.Project;
import com.erp.domain.User;
import com.erp.dto.ApprovalDtos.ApprovalActionRequest;
import com.erp.dto.ApprovalDtos.ApprovalResponse;
import com.erp.dto.ApprovalDtos.CreateApprovalRequest;
import com.erp.dto.ApprovalDtos.LinkVoucherRequest;
import com.erp.repository.ApprovalDocumentRepository;
import com.erp.repository.ApprovalFormTemplateRepository;
import com.erp.repository.ExpenseRepository;
import com.erp.repository.ProjectRepository;
import com.erp.repository.PurchaseRepository;
import com.erp.repository.SalesRepository;
import com.erp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ApprovalService {

    private static final DateTimeFormatter DRAFT_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final ApprovalDocumentRepository approvalRepository;
    private final ApprovalFormTemplateRepository formTemplateRepository;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final ExpenseRepository expenseRepository;

    /**
     * 결재함 조회.
     * scope=drafted → 내가 기안한 문서, scope=pending → 내가 결재할 차례인 문서,
     * scope=mine → 내가 기안했거나 결재선/참여자에 포함된 문서, 그 외 → 전체.
     *
     * 삭제된 문서는 includeDeleted=true 일 때만 나온다(목록의 '삭제' 탭).
     */
    @Transactional(readOnly = true)
    public List<ApprovalResponse> list(String scope, String username, boolean includeDeleted) {
        return approvalRepository.findAllWithRefs().stream()
                .filter(d -> includeDeleted || !d.isDeleted())
                .filter(d -> matchesScope(d, scope, username))
                .map(ApprovalResponse::from)
                .toList();
    }

    private boolean matchesScope(ApprovalDocument d, String scope, String username) {
        if ("drafted".equals(scope)) {
            return d.getDrafter().getUsername().equals(username);
        }
        if ("pending".equals(scope)) {
            return d.getStatus() == ApprovalStatus.IN_PROGRESS
                    && currentLine(d)
                    .map(l -> l.getApprover().getUsername().equals(username))
                    .orElse(false);
        }
        if ("mine".equals(scope)) {
            return d.getDrafter().getUsername().equals(username)
                    || d.getLines().stream().anyMatch(l -> l.getApprover().getUsername().equals(username))
                    || d.getParticipants().stream().anyMatch(p -> p.getUser().getUsername().equals(username));
        }
        return true;
    }

    @Transactional(readOnly = true)
    public ApprovalResponse get(Long id) {
        return ApprovalResponse.from(getDocument(id));
    }

    @Transactional
    public ApprovalResponse create(CreateApprovalRequest req, String username) {
        User drafter = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("기안자를 찾을 수 없습니다."));

        ApprovalFormTemplate template = resolveTemplate(req);
        LocalDate draftDate = req.draftDate() != null ? req.draftDate() : LocalDate.now();

        List<Long> approverIds = req.approverIds() == null ? List.of() : req.approverIds();
        if (!req.temporary() && approverIds.isEmpty()) {
            throw ApiException.badRequest("결재자를 1명 이상 지정하세요. 결재선 없이 보관하려면 임시저장을 쓰세요.");
        }

        int seq = approvalRepository.maxDraftSeq(draftDate) + 1;

        ApprovalDocument doc = ApprovalDocument.builder()
                .docNo(buildDocNo(draftDate, seq))
                .draftNo(draftDate.format(DRAFT_NO_DATE) + "-" + seq)
                .formTemplate(template)
                .title(req.title())
                .content(req.content() != null ? req.content() : "")
                .formData(req.formData() != null ? req.formData() : Map.of())
                .drafter(drafter)
                .draftDate(draftDate)
                .department(req.department())
                .project(resolveProject(req.projectId()))
                .reference(req.reference())
                .status(req.temporary() ? ApprovalStatus.DRAFTING : ApprovalStatus.IN_PROGRESS)
                .currentStep(1)
                .build();

        int step = 1;
        for (Long approverId : approverIds) {
            doc.addLine(ApprovalLine.builder()
                    .stepOrder(step++)
                    .approver(findUser(approverId, "결재자"))
                    .status(ApprovalLineStatus.PENDING)
                    .build());
        }
        addParticipants(doc, req.referenceUserIds(), ApprovalParticipantRole.REFERENCE);
        addParticipants(doc, req.shareUserIds(), ApprovalParticipantRole.SHARE);

        return ApprovalResponse.from(approvalRepository.save(doc));
    }

    private void addParticipants(ApprovalDocument doc, List<Long> userIds, ApprovalParticipantRole role) {
        if (userIds == null) return;
        userIds.stream().distinct().forEach(uid -> doc.addParticipant(ApprovalParticipant.builder()
                .user(findUser(uid, role.getDisplayName()))
                .role(role)
                .build()));
    }

    /** 임시저장(기안중) 문서를 상신한다. */
    @Transactional
    public ApprovalResponse submit(Long docId, String username) {
        ApprovalDocument doc = getDocument(docId);
        if (doc.getStatus() != ApprovalStatus.DRAFTING) {
            throw ApiException.badRequest("기안중인 문서만 상신할 수 있습니다.");
        }
        if (!doc.getDrafter().getUsername().equals(username)) {
            throw ApiException.badRequest("기안자만 상신할 수 있습니다.");
        }
        if (doc.getLines().isEmpty()) {
            throw ApiException.badRequest("결재선이 비어 있습니다.");
        }
        doc.setStatus(ApprovalStatus.IN_PROGRESS);
        doc.setCurrentStep(1);
        return ApprovalResponse.from(doc);
    }

    @Transactional
    public ApprovalResponse approve(Long docId, ApprovalActionRequest req, String username) {
        ApprovalDocument doc = loadForAction(docId);
        ApprovalLine line = currentActionableLine(doc, username);

        line.setStatus(ApprovalLineStatus.APPROVED);
        line.setComment(req == null ? null : req.comment());
        line.setActedAt(LocalDateTime.now());

        int maxStep = doc.getLines().stream().mapToInt(ApprovalLine::getStepOrder).max().orElse(1);
        if (doc.getCurrentStep() >= maxStep) {
            doc.setStatus(ApprovalStatus.APPROVED);
        } else {
            doc.setCurrentStep(doc.getCurrentStep() + 1);
        }
        return ApprovalResponse.from(doc);
    }

    @Transactional
    public ApprovalResponse reject(Long docId, ApprovalActionRequest req, String username) {
        ApprovalDocument doc = loadForAction(docId);
        ApprovalLine line = currentActionableLine(doc, username);

        line.setStatus(ApprovalLineStatus.REJECTED);
        line.setComment(req == null ? null : req.comment());
        line.setActedAt(LocalDateTime.now());
        doc.setStatus(ApprovalStatus.REJECTED);
        return ApprovalResponse.from(doc);
    }

    /** 소프트 삭제. 기안번호는 그대로 점유한다. */
    @Transactional
    public void delete(Long docId, String username) {
        ApprovalDocument doc = getDocument(docId);
        if (!doc.getDrafter().getUsername().equals(username)) {
            throw ApiException.badRequest("기안자만 삭제할 수 있습니다.");
        }
        if (doc.getStatus() == ApprovalStatus.APPROVED) {
            throw ApiException.badRequest("결재가 완료된 기안서는 삭제할 수 없습니다.");
        }
        doc.markDeleted();
    }

    /** ERP 전표 연결. 판매/구매/지출 중 정확히 하나. */
    @Transactional
    public ApprovalResponse linkVoucher(Long docId, LinkVoucherRequest req) {
        ApprovalDocument doc = getDocument(docId);

        long specified = countNonNull(req.salesId(), req.purchaseId(), req.expenseId());
        if (specified != 1) {
            throw ApiException.badRequest("판매/구매/지출 전표 중 정확히 하나를 지정하세요.");
        }

        ApprovalDocumentVoucher.ApprovalDocumentVoucherBuilder v = ApprovalDocumentVoucher.builder();
        if (req.salesId() != null) {
            v.sales(salesRepository.findById(req.salesId())
                    .orElseThrow(() -> ApiException.notFound("판매전표를 찾을 수 없습니다. id=" + req.salesId())));
        } else if (req.purchaseId() != null) {
            v.purchase(purchaseRepository.findById(req.purchaseId())
                    .orElseThrow(() -> ApiException.notFound("구매전표를 찾을 수 없습니다. id=" + req.purchaseId())));
        } else {
            v.expense(expenseRepository.findById(req.expenseId())
                    .orElseThrow(() -> ApiException.notFound("지출전표를 찾을 수 없습니다. id=" + req.expenseId())));
        }

        ApprovalDocumentVoucher voucher = v.build();
        boolean already = doc.getVouchers().stream().anyMatch(existing ->
                existing.getVoucherType().equals(voucher.getVoucherType())
                        && existing.getVoucherId().equals(voucher.getVoucherId()));
        if (already) {
            throw ApiException.conflict("이미 이 기안서에 연결된 전표입니다.");
        }

        doc.addVoucher(voucher);
        return ApprovalResponse.from(doc);
    }

    @Transactional
    public ApprovalResponse unlinkVoucher(Long docId, Long voucherId) {
        ApprovalDocument doc = getDocument(docId);
        boolean removed = doc.getVouchers().removeIf(v -> v.getId().equals(voucherId));
        if (!removed) {
            throw ApiException.notFound("연결된 전표를 찾을 수 없습니다. id=" + voucherId);
        }
        return ApprovalResponse.from(doc);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private static long countNonNull(Object... values) {
        long n = 0;
        for (Object v : values) if (v != null) n++;
        return n;
    }

    private ApprovalFormTemplate resolveTemplate(CreateApprovalRequest req) {
        if (req.formTemplateId() != null) {
            return formTemplateRepository.findById(req.formTemplateId())
                    .orElseThrow(() -> ApiException.notFound("양식을 찾을 수 없습니다. id=" + req.formTemplateId()));
        }
        if (req.formType() != null && !req.formType().isBlank()) {
            return formTemplateRepository.findByCode(req.formType())
                    .orElseThrow(() -> ApiException.notFound("양식을 찾을 수 없습니다. code=" + req.formType()));
        }
        throw ApiException.badRequest("양식을 선택하세요.");
    }

    private Project resolveProject(Long projectId) {
        if (projectId == null) return null;
        return projectRepository.findById(projectId)
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다. id=" + projectId));
    }

    private User findUser(Long id, String what) {
        return userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound(what + "를 찾을 수 없습니다. id=" + id));
    }

    private ApprovalDocument getDocument(Long docId) {
        return approvalRepository.findById(docId)
                .orElseThrow(() -> ApiException.notFound("기안서를 찾을 수 없습니다. id=" + docId));
    }

    private ApprovalDocument loadForAction(Long docId) {
        ApprovalDocument doc = getDocument(docId);
        if (doc.isDeleted()) {
            throw ApiException.badRequest("삭제된 기안서입니다.");
        }
        if (doc.getStatus() != ApprovalStatus.IN_PROGRESS) {
            throw ApiException.badRequest("진행중인 기안서만 결재할 수 있습니다.");
        }
        return doc;
    }

    private Optional<ApprovalLine> currentLine(ApprovalDocument d) {
        return d.getLines().stream()
                .filter(l -> l.getStepOrder() == d.getCurrentStep())
                .findFirst();
    }

    private ApprovalLine currentActionableLine(ApprovalDocument doc, String username) {
        ApprovalLine line = currentLine(doc)
                .orElseThrow(() -> ApiException.badRequest("결재 단계를 찾을 수 없습니다."));
        if (!line.getApprover().getUsername().equals(username)) {
            throw ApiException.badRequest("현재 결재 순서가 아닙니다.");
        }
        return line;
    }

    /** 기안서No. 는 기안No. 와 같은 일련번호를 쓴다 (2026/07/10-2 ↔ AP-20260710-0002). */
    private String buildDocNo(LocalDate date, int seq) {
        return "AP-" + date.format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + String.format("%04d", seq);
    }
}

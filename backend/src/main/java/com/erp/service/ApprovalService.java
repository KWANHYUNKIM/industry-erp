package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.ApprovalDocument;
import com.erp.domain.ApprovalLine;
import com.erp.domain.ApprovalLineStatus;
import com.erp.domain.ApprovalStatus;
import com.erp.domain.User;
import com.erp.dto.ApprovalDtos.ApprovalActionRequest;
import com.erp.dto.ApprovalDtos.ApprovalResponse;
import com.erp.dto.ApprovalDtos.CreateApprovalRequest;
import com.erp.repository.ApprovalDocumentRepository;
import com.erp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ApprovalService {

    private final ApprovalDocumentRepository approvalRepository;
    private final UserRepository userRepository;

    /**
     * 결재함 조회.
     * scope=drafted → 내가 기안한 문서, scope=pending → 내가 결재할 차례인 문서, 그 외 → 전체.
     */
    @Transactional(readOnly = true)
    public List<ApprovalResponse> list(String scope, String username) {
        List<ApprovalDocument> docs = approvalRepository.findAllWithRefs();
        return docs.stream()
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
            // 내가 기안했거나 결재선에 포함된 문서
            return d.getDrafter().getUsername().equals(username)
                    || d.getLines().stream()
                    .anyMatch(l -> l.getApprover().getUsername().equals(username));
        }
        return true;
    }

    @Transactional
    public ApprovalResponse create(CreateApprovalRequest req, String username) {
        User drafter = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("기안자를 찾을 수 없습니다."));

        LocalDate draftDate = req.draftDate() != null ? req.draftDate() : LocalDate.now();

        ApprovalDocument doc = ApprovalDocument.builder()
                .docNo(generateDocNo(draftDate))
                .formType(req.formType())
                .title(req.title())
                .content(req.content())
                .drafter(drafter)
                .draftDate(draftDate)
                .reference(req.reference())
                .status(ApprovalStatus.IN_PROGRESS)
                .currentStep(1)
                .build();

        int step = 1;
        for (Long approverId : req.approverIds()) {
            User approver = userRepository.findById(approverId)
                    .orElseThrow(() -> ApiException.notFound("결재자를 찾을 수 없습니다. id=" + approverId));
            doc.addLine(ApprovalLine.builder()
                    .stepOrder(step++)
                    .approver(approver)
                    .status(ApprovalLineStatus.PENDING)
                    .build());
        }

        return ApprovalResponse.from(approvalRepository.save(doc));
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

    private ApprovalDocument loadForAction(Long docId) {
        ApprovalDocument doc = approvalRepository.findById(docId)
                .orElseThrow(() -> ApiException.notFound("기안서를 찾을 수 없습니다. id=" + docId));
        if (doc.getStatus() != ApprovalStatus.IN_PROGRESS) {
            throw ApiException.badRequest("진행중인 기안서만 결재할 수 있습니다.");
        }
        return doc;
    }

    /** 현재 단계의 결재선 라인 */
    private java.util.Optional<ApprovalLine> currentLine(ApprovalDocument d) {
        return d.getLines().stream()
                .filter(l -> l.getStepOrder() == d.getCurrentStep())
                .findFirst();
    }

    /** 현재 단계 결재선이 요청자 것인지 검증 후 반환 */
    private ApprovalLine currentActionableLine(ApprovalDocument doc, String username) {
        ApprovalLine line = currentLine(doc)
                .orElseThrow(() -> ApiException.badRequest("결재 단계를 찾을 수 없습니다."));
        if (!line.getApprover().getUsername().equals(username)) {
            throw ApiException.badRequest("현재 결재 순서가 아닙니다.");
        }
        return line;
    }

    private String generateDocNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "AP-" + d + "-" + String.format("%04d", approvalRepository.count() + 1);
    }
}

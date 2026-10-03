package com.erp.groupware.workjournal;

import com.erp.common.ApiException;
import com.erp.trade.partner.BusinessPartner;
import com.erp.auth.user.User;
import com.erp.groupware.workjournal.dto.WorkJournalDtos.CreateWorkJournalRequest;
import com.erp.groupware.workjournal.dto.WorkJournalDtos.WorkJournalResponse;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.auth.user.UserRepository;
import com.erp.inventory.project.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.workjournal.dto.WorkJournalDtos;

@Service
@RequiredArgsConstructor
public class WorkJournalService {

    private final WorkJournalRepository workJournalRepository;
    private final UserRepository userRepository;
    private final BusinessPartnerRepository partnerRepository;
    // 프로젝트는 inventory 가 소유한다. 리포지토리를 직접 주입하지 않고 그 모듈의 서비스를 거친다.
    private final ProjectService projectService;

    @Transactional(readOnly = true)
    public List<WorkJournalResponse> findAll() {
        return findAll(null, null);
    }

    /** 업무일지 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @Transactional(readOnly = true)
    public List<WorkJournalResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? workJournalRepository.findAllWithRefs()
                : workJournalRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream().map(WorkJournalResponse::from).toList();
    }

    @Transactional
    public WorkJournalResponse create(CreateWorkJournalRequest req, String username) {
        User author = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("작성자를 찾을 수 없습니다."));

        WorkJournal journal = WorkJournal.builder()
                .reportDate(req.reportDate() != null ? req.reportDate() : LocalDate.now())
                .author(author)
                .department(req.department() != null ? req.department() : author.getDepartment())
                .partnerName(req.partnerName())
                .partner(matchPartner(req.partnerName()))
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .title(req.title())
                .content(req.content() != null ? req.content() : "")
                .build();

        return WorkJournalResponse.from(workJournalRepository.save(journal));
    }

    /**
     * 원본 '조회' 창의 [수정] — 같은 칸을 고친다. 고치고 지우는 것은 작성자만(다른 게시판과 같은 규칙).
     */
    @Transactional
    public WorkJournalResponse update(Long id, CreateWorkJournalRequest req, String username) {
        WorkJournal j = mine(id, username, "고칠");
        if (req.reportDate() != null) j.setReportDate(req.reportDate());
        j.setDepartment(req.department());
        j.setPartnerName(req.partnerName());
        j.setPartner(matchPartner(req.partnerName()));
        j.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        j.setTitle(req.title());
        j.setContent(req.content() != null ? req.content() : "");
        return WorkJournalResponse.from(j);
    }

    /** 원본 '조회' 창의 [삭제] — '게시글을 삭제하면 복구할 수 없습니다.' 를 묻고 지운다. */
    @Transactional
    public void delete(Long id, String username) {
        workJournalRepository.delete(mine(id, username, "지울"));
    }

    private WorkJournal mine(Long id, String username, String action) {
        WorkJournal j = workJournalRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("업무일지를 찾을 수 없습니다. id=" + id));
        if (!j.getAuthor().getUsername().equals(username)) {
            throw ApiException.badRequest("본인이 쓴 업무일지만 " + action + " 수 있습니다.");
        }
        return j;
    }

    /** 거래처명이 마스터와 정확히 일치할 때만 연결한다(없으면 null + 입력 문자열 보존). */
    private BusinessPartner matchPartner(String name) {
        if (name == null || name.isBlank()) return null;
        return partnerRepository.findByName(name.trim()).orElse(null);
    }
}

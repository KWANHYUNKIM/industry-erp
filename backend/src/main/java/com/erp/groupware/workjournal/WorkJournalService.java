package com.erp.groupware.workjournal;

import com.erp.common.ApiException;
import com.erp.trade.partner.BusinessPartner;
import com.erp.auth.user.User;
import com.erp.groupware.workjournal.dto.WorkJournalDtos.CreateWorkJournalRequest;
import com.erp.groupware.workjournal.dto.WorkJournalDtos.WorkJournalResponse;
import com.erp.groupware.workjournal.dto.WorkJournalDtos.WorkJournalViewersResponse;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.auth.user.UserRepository;
import com.erp.inventory.project.ProjectService;
import com.erp.common.history.ChangeHistoryService;
import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.workjournal.dto.WorkJournalDtos;

@Service
@RequiredArgsConstructor
public class WorkJournalService {

    /** [H] '이력' 대상 글자(change_histories.target). */
    public static final String WORK_JOURNAL_HISTORY = "WORK_JOURNAL";

    private final WorkJournalRepository workJournalRepository;
    private final UserRepository userRepository;
    private final BusinessPartnerRepository partnerRepository;
    // 프로젝트는 inventory 가 소유한다. 리포지토리를 직접 주입하지 않고 그 모듈의 서비스를 거친다.
    private final ProjectService projectService;
    private final ChangeHistoryService changeHistoryService;
    private final WorkJournalViewRepository viewRepository;
    private final com.erp.common.StoredFileRepository storedFileRepository;

    /** 첨부 파일. null 이면 안 붙인 것이다. */
    private com.erp.common.StoredFile attachmentOf(Long id) {
        if (id == null) return null;
        var f = storedFileRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("첨부 파일을 찾을 수 없습니다. id=" + id));
        if (f.getOwnerCode() == null) f.setOwnerCode("GROUPWARE");
        return f;
    }

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
                .parentId(parentOf(req.parentId()))
                .attachment(attachmentOf(req.attachmentId()))
                .build();

        WorkJournal saved = workJournalRepository.save(journal);
        changeHistoryService.record(WORK_JOURNAL_HISTORY, saved.getId(), ChangeHistoryService.CREATED);
        return WorkJournalResponse.from(saved);
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
        j.setAttachment(attachmentOf(req.attachmentId()));
        changeHistoryService.record(WORK_JOURNAL_HISTORY, j.getId(), ChangeHistoryService.UPDATED);
        return WorkJournalResponse.from(j);
    }

    /**
     * 원본 '조회' 창 · 수정 창 [H] '이력'(2026-10-14 E070304 실측) — 저장할 때마다 한 줄(1 GUEST … 신규 · 2 … 수정).
     * 답글도 자기 줄을 갖는다. 이 표를 붙이기 전의 글은 만든 사람 · 때로 '신규' 한 줄을 지어 보인다.
     */
    @Transactional(readOnly = true)
    public List<ChangeHistoryResponse> history(Long id) {
        WorkJournal j = workJournalRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("업무일지를 찾을 수 없습니다. id=" + id));
        return changeHistoryService.list(WORK_JOURNAL_HISTORY, id, j.getAuthor().getUsername(), j.getCreatedAt());
    }

    /**
     * '조회' 창을 열 때 — 조회 기록을 남긴다(처음이면 최초 · 최종 둘 다, 다시 열면 최종만).
     * 원본(2026-10-20 실측): 글쓴이 자신이 연 것은 조회자에 오르지 않는다.
     */
    @Transactional
    public void markViewed(Long id, String username) {
        WorkJournal j = workJournalRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("업무일지를 찾을 수 없습니다. id=" + id));
        if (j.getAuthor().getUsername().equals(username)) return;
        var now = java.time.LocalDateTime.now();
        viewRepository.findByJournalIdAndUsername(id, username).ifPresentOrElse(
                v -> v.setLastViewedAt(now),
                () -> viewRepository.save(WorkJournalView.builder()
                        .journalId(id).username(username).firstViewedAt(now).lastViewedAt(now).build()));
    }

    /**
     * 원본 [R] '조회자 현황'(2026-10-20 E070304 실측) — [미조회자] 는 글쓴이와 조회자를 뺀 회사 사용자 전부
     * (이름 차례, 한글 이름 먼저 · 영문 'demo · ecount · sykim' 뒤), [조회자] 는 처음 본 차례.
     */
    @Transactional(readOnly = true)
    public WorkJournalViewersResponse viewers(Long id) {
        WorkJournal j = workJournalRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("업무일지를 찾을 수 없습니다. id=" + id));
        var views = viewRepository.findByJournalIdOrderByFirstViewedAtAsc(id);
        var users = userRepository.findAll();
        java.util.Map<String, String> nameOf = new java.util.HashMap<>();
        for (User u : users) nameOf.put(u.getUsername(), u.getName());
        var seen = new java.util.HashSet<String>();
        for (var v : views) seen.add(v.getUsername());
        String author = j.getAuthor().getUsername();
        java.util.Comparator<String> hangulFirst = java.util.Comparator
                .comparing((String n) -> n.isEmpty() || n.charAt(0) < 0xAC00 || n.charAt(0) > 0xD7A3)
                .thenComparing(String.CASE_INSENSITIVE_ORDER);
        List<String> notViewed = users.stream()
                .filter(User::isEnabled)
                .filter(u -> !u.getUsername().equals(author) && !seen.contains(u.getUsername()))
                .map(User::getName)
                .sorted(hangulFirst)
                .toList();
        List<WorkJournalViewersResponse.Viewer> viewed = views.stream()
                .map(v -> new WorkJournalViewersResponse.Viewer(
                        nameOf.getOrDefault(v.getUsername(), v.getUsername()), v.getFirstViewedAt(), v.getLastViewedAt()))
                .toList();
        return new WorkJournalViewersResponse(notViewed, viewed);
    }

    /** 원본 '조회' 창의 [삭제] — '게시글을 삭제하면 복구할 수 없습니다.' 를 묻고 지운다. */
    @Transactional
    public void delete(Long id, String username) {
        WorkJournal j = mine(id, username, "지울");
        // 원본 E070304(2026-10-12 실측): 답글이 달린 글의 [삭제]는 이 안내만 띄우고 지우지 않는다.
        if (workJournalRepository.existsByParentId(id)) {
            throw ApiException.badRequest("답변이 있는 글은 삭제할 수 없습니다.\n\n답변 삭제 후 다시 시도 바랍니다.");
        }
        workJournalRepository.delete(j);
    }

    /** 답글의 원글이 있는지 본다. 없는 글에 답글을 달면 404. */
    private Long parentOf(Long parentId) {
        if (parentId == null) return null;
        if (!workJournalRepository.existsById(parentId)) {
            throw ApiException.notFound("업무일지를 찾을 수 없습니다. id=" + parentId);
        }
        return parentId;
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

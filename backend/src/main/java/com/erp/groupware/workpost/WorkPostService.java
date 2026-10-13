package com.erp.groupware.workpost;

import com.erp.auth.user.User;
import com.erp.auth.user.UserService;
import com.erp.common.ApiException;
import com.erp.common.StoredFile;
import com.erp.common.StoredFileRepository;
import com.erp.groupware.board.PostBoard;
import com.erp.common.DocumentNoGenerator;
import com.erp.groupware.workpost.dto.WorkPostDtos.CreateWorkPostRequest;
import com.erp.groupware.workpost.dto.WorkPostDtos.UpdateWorkPostStatusRequest;
import com.erp.groupware.workpost.dto.WorkPostDtos.WorkPostResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.workpost.dto.WorkPostDtos;

@Service
@RequiredArgsConstructor
public class WorkPostService {

    private final WorkPostRepository workPostRepository;
    // writer 는 로그인 아이디다(FK). 화면에는 사람 이름을 보여야 하므로 여기서 옮긴다.
    private final UserService userService;
    private final WorkPostReadRepository readRepository;
    private final DocumentNoGenerator docNo;
    private final StoredFileRepository storedFileRepository;

    /** 첨부 파일. null 이면 안 붙인 것이다 — 없는 id 를 주면 그건 오류다. */
    private StoredFile attachmentOf(Long id) {
        if (id == null) return null;
        StoredFile f = storedFileRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("첨부 파일을 찾을 수 없습니다. id=" + id));
        /* 붙는 순간 이 파일의 주인을 적는다 — 업무게시판은 생산 권한 아래에 있다. */
        if (f.getOwnerCode() == null) f.setOwnerCode("PRODUCTION");
        return f;
    }

    /** 로그인 아이디 → 표시 이름. 계정이 지워졌으면 아이디를 그대로 보여 준다. */
    private String displayName(String username) {
        if (username == null) return null;
        try { return userService.getByUsername(username).getName(); }
        catch (ApiException e) { return username; }
    }

    @Transactional(readOnly = true)
    public List<WorkPostResponse> findAll(PostBoard board) {
        return workPostRepository.findByBoardOrdered(board != null ? board : PostBoard.WORK).stream()
                .map((post) -> WorkPostResponse.from(post, displayName(post.getWriter())))
                .toList();
    }

    @Transactional
    public WorkPostResponse create(CreateWorkPostRequest req, String writer) {
        // 게시글번호는 게시판을 가로질러 하나의 줄기다. max+1 이라 두 사람이 동시에 쓰면
        // 같은 번호를 읽으므로 번호 공간에 락을 건다.
        PostBoard board = req.board() != null ? req.board() : PostBoard.WORK;
        requireContent(board, req.content());
        // 새 게시판(통합게시판 · 팀별회의록 · 간판제작)은 번호를 혼자 센다 — PostBoard#ownNumbering.
        docNo.lockNumberSpace(board.ownNumbering() ? "WORK-POST-NO-" + board.name() : "WORK-POST-NO");
        WorkPost post = WorkPost.builder()
                .board(board)
                .postNo((board.ownNumbering() ? workPostRepository.maxPostNoOf(board) : workPostRepository.maxPostNo()) + 1)
                .postDate(req.postDate() != null ? req.postDate() : LocalDate.now())
                .title(req.title())
                .content(req.content() == null ? "" : req.content())
                .writer(writer)
                .forwardTo(req.forwardTo())
                .ccTo(req.ccTo())
                .notice(Boolean.TRUE.equals(req.notice()))
                .attachment(attachmentOf(req.attachmentId()))
                .status(WorkPostStatus.IN_PROGRESS)
                .stage(board.namedStages() ? blankToNull(req.stage()) : null)
                /*
                 * 원본 통합게시판 · 간판제작 격자의 [완료일]은 저장한 날이 찍혀 있다(2026-10-13 글 1건 저장 → 2026/10/13).
                 * 진행상태가 회사가 정한 이름뿐이라 '완료로 바꾼 때' 가 따로 없다.
                 */
                .completedAt(board.namedStages() ? java.time.LocalDateTime.now() : null)
                .weekNo(board == PostBoard.MINUTES ? weekOf(req.weekNo()) : null)
                .meetingLinks(board == PostBoard.MINUTES ? joinLinks(req.meetingLinks()) : null)
                .build();
        return WorkPostResponse.from(workPostRepository.save(post), displayName(writer));
    }

    /** 제목·내용·전달자만 고친다. 작성자·게시글번호·일자는 그 글의 기록이라 두 번 쓰지 않는다. */
    @Transactional
    public WorkPostResponse update(Long id, WorkPostDtos.UpdateWorkPostRequest req) {
        WorkPost post = getPost(id);
        requireContent(post.getBoard(), req.content());
        post.setTitle(req.title());
        post.setContent(req.content() == null ? "" : req.content());
        post.setForwardTo(req.forwardTo());
        post.setCcTo(req.ccTo());
        post.setNotice(Boolean.TRUE.equals(req.notice()));
        post.setAttachment(attachmentOf(req.attachmentId()));
        if (post.getBoard().namedStages()) post.setStage(blankToNull(req.stage()));
        if (post.getBoard() == PostBoard.MINUTES) {
            post.setWeekNo(weekOf(req.weekNo()));
            post.setMeetingLinks(joinLinks(req.meetingLinks()));
        }
        return WorkPostResponse.from(post, displayName(post.getWriter()));
    }

    /** 통합회의록은 내용 없이도 저장된다(원본 2026-10-13 — 부서 칸 · 주 차만 넣고 저장). 그 밖의 게시판은 막는다. */
    private static void requireContent(PostBoard board, String content) {
        if (board != PostBoard.MINUTES && (content == null || content.isBlank())) throw ApiException.badRequest("내용을 입력하세요.");
    }

    /** 원본 주차검색: 1 1주차 ~ 5 5주차. */
    private static Integer weekOf(Integer w) {
        if (w == null) return null;
        if (w < 1 || w > 5) throw ApiException.badRequest("주 차 구분은 1주차 ~ 5주차 중에서 고르세요.");
        return w;
    }

    /**
     * 통합회의록 부서 칸 → '12,,,15'. 칸마다 <b>팀별회의록 게시판 글</b>만 이을 수 있다
     * (원본 칸의 🔍 는 '팀별회의록 게시판검색창' 을 띄운다). 모두 비면 null.
     */
    private String joinLinks(java.util.List<Long> ids) {
        if (ids == null || ids.stream().allMatch(java.util.Objects::isNull)) return null;
        if (ids.size() > 4) throw ApiException.badRequest("부서 회의록 칸은 넷입니다.");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) {
            if (i > 0) sb.append(',');
            Long linked = ids.get(i);
            if (linked == null) continue;
            WorkPost m = workPostRepository.findById(linked)
                    .filter(x -> x.getBoard() == PostBoard.MEETING)
                    .orElseThrow(() -> ApiException.badRequest("팀별회의록 게시판 글을 찾을 수 없습니다. id=" + linked));
            sb.append(m.getId());
        }
        return sb.toString();
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    @Transactional
    public WorkPostResponse updateStatus(Long id, UpdateWorkPostStatusRequest req) {
        WorkPost post = getPost(id);
        // 회사가 정한 진행상태 이름을 쓰는 게시판 — 이름만 바꾼다(진행중/완료 토글은 WORK 의 것).
        if (post.getBoard().namedStages()) {
            if (req.stage() == null || req.stage().isBlank()) throw ApiException.badRequest("진행상태를 고르세요.");
            post.setStage(req.stage().trim());
            return WorkPostResponse.from(post, displayName(post.getWriter()));
        }
        WorkPostStatus target = req.status() != null ? req.status()
                : (post.getStatus() == WorkPostStatus.DONE ? WorkPostStatus.IN_PROGRESS : WorkPostStatus.DONE);
        post.setStatus(target);
        /*
         * 원본 WORK입력 폼의 [완료일시]. 완료로 바꿀 때 찍고, 되돌리면 지운다.
         * 되돌릴 때 지우지 않으면 '진행중인데 완료일시가 있는' 줄이 남아, 그 열을 근거로
         * 무엇을 세는 순간 조용히 틀린다.
         */
        if (target == WorkPostStatus.DONE) {
            post.setCompletedAt(req.completedAt() != null ? req.completedAt() : java.time.LocalDateTime.now());
        } else {
            post.setCompletedAt(null);
        }
        return WorkPostResponse.from(post, displayName(post.getWriter()));
    }

    /** 원본 [라벨변경] — 고른 라벨로 바꾼다. 같은 이름은 한 번만, 차례는 고른 차례. */
    @Transactional
    public WorkPostResponse updateLabels(Long id, java.util.List<String> labels) {
        WorkPost post = getPost(id);
        String joined = labels == null ? "" : String.join(",", labels.stream()
                .map(x -> x == null ? "" : x.trim().replace(",", " "))
                .filter(x -> !x.isEmpty()).distinct().toList());
        if (joined.length() > 200) throw ApiException.badRequest("라벨이 너무 많습니다.");
        post.setLabels(joined.isEmpty() ? null : joined);
        return WorkPostResponse.from(post, displayName(post.getWriter()));
    }

    /**
     * 원본 격자의 <b>[조회]</b> 열. 글을 펼칠 때 하나 올린다.
     *
     * <p>목록을 부르는 것만으로는 안 올린다 — 그러면 화면을 열 때마다 모든 글의 조회수가
     * 같이 올라가서, 그 숫자가 '몇 명이 봤나' 를 뜻하지 않게 된다.
     */
    @Transactional
    public WorkPostResponse read(Long id, String username) {
        WorkPost post = getPost(id);
        post.setViewCount(post.getViewCount() + 1);
        /* 원본 '조회자 현황' — 사람마다 처음 · 마지막으로 연 때. 로그인한 사람을 못 찾으면 세기만 한다. */
        if (username != null) {
            User me;
            try { me = userService.getByUsername(username); } catch (ApiException e) { me = null; }
            if (me != null) {
                java.time.LocalDateTime now = java.time.LocalDateTime.now();
                WorkPostRead r = readRepository.findByPostIdAndUserId(post.getId(), me.getId()).orElse(null);
                if (r == null) readRepository.save(WorkPostRead.builder().post(post).user(me).firstReadAt(now).lastReadAt(now).build());
                else r.setLastReadAt(now);
            }
        }
        return WorkPostResponse.from(post, displayName(post.getWriter()));
    }

    /** 원본 [조회] 'R' → '조회자 현황': 조회자(처음 연 차례)와 아직 안 연 사람(사용 중인 사용자 중). */
    @Transactional(readOnly = true)
    public WorkPostDtos.ReadersResponse readers(Long id) {
        WorkPost post = getPost(id);
        List<WorkPostRead> reads = readRepository.findAllByPostIdWithUser(post.getId());
        java.util.Set<Long> readIds = new java.util.HashSet<>();
        List<WorkPostDtos.Reader> readers = reads.stream().map(r -> {
            readIds.add(r.getUser().getId());
            return new WorkPostDtos.Reader(r.getUser().getName(), r.getFirstReadAt(), r.getLastReadAt());
        }).toList();
        List<String> nonReaders = userService.findAll().stream()
                .filter(u -> u.enabled() && !readIds.contains(u.id()))
                .map(u -> u.name())
                .toList();
        return new WorkPostDtos.ReadersResponse(readers, nonReaders);
    }

    @Transactional
    public void delete(Long id) {
        workPostRepository.delete(getPost(id));
    }

    private WorkPost getPost(Long id) {
        return workPostRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("게시글을 찾을 수 없습니다. id=" + id));
    }
}

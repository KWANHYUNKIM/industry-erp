package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import com.erp.common.StoredFile;
import com.erp.common.StoredFileRepository;
import com.erp.groupware.domain.WorkPost;
import com.erp.groupware.domain.WorkPostStatus;
import com.erp.groupware.domain.enums.PostBoard;
import com.erp.common.DocumentNoGenerator;
import com.erp.groupware.dto.WorkPostDtos.CreateWorkPostRequest;
import com.erp.groupware.dto.WorkPostDtos.UpdateWorkPostStatusRequest;
import com.erp.groupware.dto.WorkPostDtos.WorkPostResponse;
import com.erp.groupware.repository.WorkPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.dto.WorkPostDtos;

@Service
@RequiredArgsConstructor
public class WorkPostService {

    private final WorkPostRepository workPostRepository;
    // writer 는 로그인 아이디다(FK). 화면에는 사람 이름을 보여야 하므로 여기서 옮긴다.
    private final UserRepository userRepository;
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
        return userRepository.findByUsername(username).map(User::getName).orElse(username);
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
        docNo.lockNumberSpace("WORK-POST-NO");
        WorkPost post = WorkPost.builder()
                .board(req.board() != null ? req.board() : PostBoard.WORK)
                .postNo(workPostRepository.maxPostNo() + 1)
                .postDate(req.postDate() != null ? req.postDate() : LocalDate.now())
                .title(req.title())
                .content(req.content())
                .writer(writer)
                .forwardTo(req.forwardTo())
                .ccTo(req.ccTo())
                .notice(Boolean.TRUE.equals(req.notice()))
                .attachment(attachmentOf(req.attachmentId()))
                .status(WorkPostStatus.IN_PROGRESS)
                .build();
        return WorkPostResponse.from(workPostRepository.save(post), displayName(writer));
    }

    /** 제목·내용·전달자만 고친다. 작성자·게시글번호·일자는 그 글의 기록이라 두 번 쓰지 않는다. */
    @Transactional
    public WorkPostResponse update(Long id, WorkPostDtos.UpdateWorkPostRequest req) {
        WorkPost post = getPost(id);
        post.setTitle(req.title());
        post.setContent(req.content());
        post.setForwardTo(req.forwardTo());
        post.setCcTo(req.ccTo());
        post.setNotice(Boolean.TRUE.equals(req.notice()));
        post.setAttachment(attachmentOf(req.attachmentId()));
        return WorkPostResponse.from(post, displayName(post.getWriter()));
    }

    @Transactional
    public WorkPostResponse updateStatus(Long id, UpdateWorkPostStatusRequest req) {
        WorkPost post = getPost(id);
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

    /**
     * 원본 격자의 <b>[조회]</b> 열. 글을 펼칠 때 하나 올린다.
     *
     * <p>목록을 부르는 것만으로는 안 올린다 — 그러면 화면을 열 때마다 모든 글의 조회수가
     * 같이 올라가서, 그 숫자가 '몇 명이 봤나' 를 뜻하지 않게 된다.
     */
    @Transactional
    public WorkPostResponse read(Long id) {
        WorkPost post = getPost(id);
        post.setViewCount(post.getViewCount() + 1);
        return WorkPostResponse.from(post, displayName(post.getWriter()));
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

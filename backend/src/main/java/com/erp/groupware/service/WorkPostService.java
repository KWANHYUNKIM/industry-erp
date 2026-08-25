package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import com.erp.groupware.domain.WorkPost;
import com.erp.groupware.domain.WorkPostStatus;
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

    /** 로그인 아이디 → 표시 이름. 계정이 지워졌으면 아이디를 그대로 보여 준다. */
    private String displayName(String username) {
        if (username == null) return null;
        return userRepository.findByUsername(username).map(User::getName).orElse(username);
    }

    @Transactional(readOnly = true)
    public List<WorkPostResponse> findAll() {
        return workPostRepository.findAllOrdered().stream()
                .map((post) -> WorkPostResponse.from(post, displayName(post.getWriter())))
                .toList();
    }

    @Transactional
    public WorkPostResponse create(CreateWorkPostRequest req, String writer) {
        WorkPost post = WorkPost.builder()
                .postNo(workPostRepository.maxPostNo() + 1)
                .postDate(req.postDate() != null ? req.postDate() : LocalDate.now())
                .title(req.title())
                .content(req.content())
                .writer(writer)
                .forwardTo(req.forwardTo())
                .status(WorkPostStatus.IN_PROGRESS)
                .build();
        return WorkPostResponse.from(workPostRepository.save(post), displayName(writer));
    }

    @Transactional
    public WorkPostResponse updateStatus(Long id, UpdateWorkPostStatusRequest req) {
        WorkPost post = getPost(id);
        WorkPostStatus target = req.status() != null ? req.status()
                : (post.getStatus() == WorkPostStatus.DONE ? WorkPostStatus.IN_PROGRESS : WorkPostStatus.DONE);
        post.setStatus(target);
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

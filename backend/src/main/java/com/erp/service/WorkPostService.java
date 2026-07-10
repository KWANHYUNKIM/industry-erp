package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.WorkPost;
import com.erp.domain.WorkPostStatus;
import com.erp.dto.WorkPostDtos.CreateWorkPostRequest;
import com.erp.dto.WorkPostDtos.UpdateWorkPostStatusRequest;
import com.erp.dto.WorkPostDtos.WorkPostResponse;
import com.erp.repository.WorkPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkPostService {

    private final WorkPostRepository workPostRepository;

    @Transactional(readOnly = true)
    public List<WorkPostResponse> findAll() {
        return workPostRepository.findAllOrdered().stream()
                .map(WorkPostResponse::from)
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
        return WorkPostResponse.from(workPostRepository.save(post));
    }

    @Transactional
    public WorkPostResponse updateStatus(Long id, UpdateWorkPostStatusRequest req) {
        WorkPost post = getPost(id);
        WorkPostStatus target = req.status() != null ? req.status()
                : (post.getStatus() == WorkPostStatus.DONE ? WorkPostStatus.IN_PROGRESS : WorkPostStatus.DONE);
        post.setStatus(target);
        return WorkPostResponse.from(post);
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

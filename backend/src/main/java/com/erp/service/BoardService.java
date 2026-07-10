package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.BoardPost;
import com.erp.dto.BoardDtos.CreatePostRequest;
import com.erp.dto.BoardDtos.PostDetail;
import com.erp.dto.BoardDtos.PostSummary;
import com.erp.repository.BoardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BoardService {

    private final BoardRepository boardRepository;

    @Transactional(readOnly = true)
    public List<PostSummary> findAll() {
        return boardRepository.findAll(Sort.by(Sort.Direction.DESC, "id")).stream()
                .map(PostSummary::from)
                .toList();
    }

    /** 상세 조회. 조회수 +1. */
    @Transactional
    public PostDetail read(Long id) {
        BoardPost p = get(id);
        p.setViews(p.getViews() + 1);
        return PostDetail.from(p);
    }

    @Transactional
    public PostDetail create(CreatePostRequest req, String author) {
        BoardPost p = BoardPost.builder()
                .title(req.title())
                .content(req.content())
                .category(req.category() != null ? req.category() : "자유")
                .author(author)
                .views(0)
                .build();
        return PostDetail.from(boardRepository.save(p));
    }

    /** 작성자 본인 또는 ADMIN/MANAGER 만 삭제 가능. */
    @Transactional
    public void delete(Long id, String username, boolean isManager) {
        BoardPost p = get(id);
        if (!isManager && !username.equals(p.getAuthor())) {
            throw new ApiException(org.springframework.http.HttpStatus.FORBIDDEN,
                    "작성자 또는 관리자만 삭제할 수 있습니다.");
        }
        boardRepository.delete(p);
    }

    private BoardPost get(Long id) {
        return boardRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("게시글을 찾을 수 없습니다. id=" + id));
    }
}

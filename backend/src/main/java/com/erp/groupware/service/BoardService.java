package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.BoardPost;
import com.erp.groupware.dto.BoardDtos.CreatePostRequest;
import com.erp.groupware.dto.BoardDtos.PostDetail;
import com.erp.groupware.dto.BoardDtos.PostSummary;
import com.erp.groupware.repository.BoardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.groupware.dto.BoardDtos;

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
        // 익명 글도 작성자는 남긴다. 본인 확인 없이 삭제를 허용할 수 없고, 문제가 생기면
        // 추적할 수 있어야 한다. 가리는 것은 응답(BoardDtos)이다.
        BoardPost p = BoardPost.builder()
                .title(req.title())
                .content(req.content())
                .category(req.category() != null ? req.category() : "자유")
                .author(author)
                .anonymous(Boolean.TRUE.equals(req.anonymous()))
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

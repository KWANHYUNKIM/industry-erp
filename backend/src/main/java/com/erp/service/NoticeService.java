package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Notice;
import com.erp.dto.NoticeDtos.CreateNoticeRequest;
import com.erp.dto.NoticeDtos.NoticeResponse;
import com.erp.dto.NoticeDtos.UpdateNoticeRequest;
import com.erp.repository.NoticeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NoticeService {

    private final NoticeRepository noticeRepository;

    /** 상단 고정글 우선, 그다음 최신순. */
    @Transactional(readOnly = true)
    public List<NoticeResponse> findAll() {
        return noticeRepository.findAll(Sort.by(Sort.Order.desc("pinned"), Sort.Order.desc("id"))).stream()
                .map(NoticeResponse::from)
                .toList();
    }

    @Transactional
    public NoticeResponse create(CreateNoticeRequest req, String username) {
        Notice n = Notice.builder()
                .title(req.title())
                .content(req.content())
                .category(req.category())
                .pinned(Boolean.TRUE.equals(req.pinned()))
                .views(0)
                .author(username)
                .build();
        return NoticeResponse.from(noticeRepository.save(n));
    }

    @Transactional
    public NoticeResponse update(Long id, UpdateNoticeRequest req) {
        Notice n = get(id);
        if (req.title() != null) n.setTitle(req.title());
        if (req.content() != null) n.setContent(req.content());
        if (req.category() != null) n.setCategory(req.category());
        if (req.pinned() != null) n.setPinned(req.pinned());
        return NoticeResponse.from(n);
    }

    /** 조회수 1 증가. */
    @Transactional
    public NoticeResponse increaseView(Long id) {
        Notice n = get(id);
        n.setViews(n.getViews() + 1);
        return NoticeResponse.from(n);
    }

    @Transactional
    public void delete(Long id) {
        noticeRepository.delete(get(id));
    }

    private Notice get(Long id) {
        return noticeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공지사항을 찾을 수 없습니다. id=" + id));
    }
}

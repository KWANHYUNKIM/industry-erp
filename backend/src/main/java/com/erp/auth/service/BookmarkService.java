package com.erp.auth.service;

import com.erp.auth.domain.User;
import com.erp.auth.domain.UserBookmark;
import com.erp.auth.dto.BookmarkDtos.BookmarkResponse;
import com.erp.auth.dto.BookmarkDtos.CreateBookmarkRequest;
import com.erp.auth.repository.UserBookmarkRepository;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 사용자별 북마크(원본 상단 북마크바 + [즐겨찾기]). */
@Service
@RequiredArgsConstructor
public class BookmarkService {

    /**
     * 아직 아무것도 담지 않은 사람에게 보여 줄 기본 북마크.
     *
     * <p>원본도 처음부터 몇 개가 담겨 있다. 빈 줄을 보여 주면 이 바가 무엇인지 알 수 없다.
     * <b>DB 에 심지 않는다</b> — 심으면 지운 사람에게 다시 살아나거나, 지웠다는 사실을
     * 따로 기억해야 한다. 담은 것이 하나도 없을 때만 이걸 내려 준다.
     */
    private static final List<BookmarkResponse> DEFAULTS = List.of(
            new BookmarkResponse(null, "품목등록", "/inventory/items", 0),
            new BookmarkResponse(null, "거래처등록", "/sales/partners", 1),
            new BookmarkResponse(null, "구매입력", "/sales/buy", 2),
            new BookmarkResponse(null, "판매입력", "/sales/sell", 3),
            new BookmarkResponse(null, "채권·채무현황", "/sales/ledger", 4),
            new BookmarkResponse(null, "거래처관리대장", "/sales/partner-ledger", 5));

    private final UserBookmarkRepository bookmarkRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<BookmarkResponse> findMine(Long userId) {
        List<UserBookmark> mine = bookmarkRepository.findByUser_IdOrderBySortOrderAscIdAsc(userId);
        if (mine.isEmpty()) return DEFAULTS;
        return mine.stream().map(BookmarkResponse::from).toList();
    }

    /**
     * 지금 화면을 담는다.
     *
     * <p>처음 담는 사람은 기본 북마크가 <b>같이 저장된다.</b> 안 그러면 하나를 담는 순간
     * 기본 여섯 개가 통째로 사라진다 — 담은 적 없는 것이 지워지는 셈이다.
     */
    @Transactional
    public List<BookmarkResponse> add(Long userId, CreateBookmarkRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + userId));
        String path = req.path().trim();

        if (!bookmarkRepository.existsByUser_Id(userId)) {
            for (BookmarkResponse d : DEFAULTS) {
                bookmarkRepository.save(UserBookmark.builder()
                        .user(user).label(d.label()).path(d.path()).sortOrder(d.sortOrder()).build());
            }
        }
        if (bookmarkRepository.findByUser_IdAndPath(userId, path).isPresent()) {
            throw ApiException.conflict("이미 북마크에 있습니다: " + req.label());
        }
        int next = bookmarkRepository.findByUser_IdOrderBySortOrderAscIdAsc(userId).stream()
                .mapToInt(UserBookmark::getSortOrder).max().orElse(-1) + 1;
        bookmarkRepository.save(UserBookmark.builder()
                .user(user).label(req.label().trim()).path(path).sortOrder(next).build());
        return findMine(userId);
    }

    /**
     * 담은 것을 뺀다.
     *
     * <p>아직 아무것도 담지 않은 사람이 기본 북마크를 빼려 하면, 기본 여섯을 먼저 저장하고
     * 그중 하나를 뺀다. 안 그러면 뺄 대상이 DB 에 없어 아무 일도 안 일어난다.
     */
    @Transactional
    public List<BookmarkResponse> remove(Long userId, String path) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + userId));
        if (!bookmarkRepository.existsByUser_Id(userId)) {
            for (BookmarkResponse d : DEFAULTS) {
                bookmarkRepository.save(UserBookmark.builder()
                        .user(user).label(d.label()).path(d.path()).sortOrder(d.sortOrder()).build());
            }
        }
        bookmarkRepository.findByUser_IdAndPath(userId, path.trim())
                .ifPresent(bookmarkRepository::delete);
        return findMine(userId);
    }
}

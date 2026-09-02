package com.erp.auth.controller;

import com.erp.auth.dto.BookmarkDtos.BookmarkResponse;
import com.erp.auth.dto.BookmarkDtos.CreateBookmarkRequest;
import com.erp.auth.service.BookmarkService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 로그인한 사람 자신의 북마크만 다룬다. 남의 것을 건드릴 경로를 두지 않는다. */
@RestController
@RequestMapping("/api/bookmarks")
@RequiredArgsConstructor
public class BookmarkController {

    private final BookmarkService bookmarkService;

    @GetMapping
    public List<BookmarkResponse> mine(@AuthenticationPrincipal UserPrincipal me) {
        return bookmarkService.findMine(me.getId());
    }

    @PostMapping
    public List<BookmarkResponse> add(@AuthenticationPrincipal UserPrincipal me,
                                      @Valid @RequestBody CreateBookmarkRequest req) {
        return bookmarkService.add(me.getId(), req);
    }

    @DeleteMapping
    public List<BookmarkResponse> remove(@AuthenticationPrincipal UserPrincipal me,
                                         @RequestParam String path) {
        return bookmarkService.remove(me.getId(), path);
    }
}

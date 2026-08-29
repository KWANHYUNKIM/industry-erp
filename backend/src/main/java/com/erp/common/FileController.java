package com.erp.common;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import com.erp.common.ApiException;
import com.erp.security.UserPrincipal;

/**
 * 파일 업로드/다운로드 공통 엔드포인트. 소유 화면(ECDrive·증빙센터·보고파일)이 파일 id 만 들고 다닌다.
 *
 * 접근 제어는 파일을 소유한 화면의 권한을 따른다(파일 자체에는 별도 권한 코드를 두지 않는다) —
 * 로그인한 사용자만 호출할 수 있다.
 */
@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService storage;

    /** 파일 업로드. 응답의 id 를 소유 엔티티에 붙여 쓴다. */
    @PostMapping
    public FileMeta upload(@RequestPart("file") MultipartFile file,
                           @AuthenticationPrincipal UserPrincipal principal) {
        return FileMeta.from(storage.store(file, principal != null ? principal.getUsername() : null));
    }

    @GetMapping("/{id}/meta")
    public FileMeta meta(@PathVariable Long id) {
        return FileMeta.from(storage.meta(id));
    }

    /** 다운로드. 한글 파일명이 깨지지 않도록 RFC 5987 형식으로 내려보낸다. */
    @GetMapping("/{id}")
    public ResponseEntity<Resource> download(@PathVariable Long id) {
        StoredFile meta = storage.meta(id);
        byte[] bytes = storage.load(id);
        String encoded = URLEncoder.encode(meta.getName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .contentType(MediaType.parseMediaType(
                        meta.getContentType() != null ? meta.getContentType() : "application/octet-stream"))
                .contentLength(bytes.length)
                .body(new ByteArrayResource(bytes));
    }

    /**
     * 파일 지우기 — <b>올린 사람과 관리자만</b>.
     *
     * <p>예전에는 누구든 지울 수 있었다. 권한이 하나도 없는 계정으로 로그인해
     * {@code DELETE /api/files/11} 을 부르니 <b>204 로 지워졌고</b> 증빙은 정말 사라졌다.
     * 이 파일 맨 위 주석은 "접근 제어는 파일을 소유한 화면의 권한을 따른다" 고 적어 뒀지만,
     * {@code /api/files} 는 메뉴 권한 카탈로그에 없어서 인가 인터셉터가
     * {@code requiredCode == null} 로 보고 그냥 통과시키고 있었다. 적어 둔 정책과
     * 실제로 도는 코드가 달랐다.
     *
     * <p>권한 코드 하나로 막지 않는다. 파일은 증빙센터·드라이브·품목이미지·보고파일·설문이
     * 함께 쓰는 공용 자원이라, 코드 하나를 요구하면 그 코드를 안 가진 화면이 조용히 깨진다
     * (인가 인터셉터의 READ_GUARDED 주석이 같은 함정을 적어 두고 있다). 대신 <b>올린 사람</b>
     * 으로 가른다 — 그 값은 업로드할 때 이미 적어 두고 있었다.
     *
     * <p>모듈 안쪽에서 이어 지우는 길(증빙·드라이브·보고파일이 문서를 지우며 파일도 지운다)은
     * 서비스를 직접 부르므로 이 검사를 지나지 않는다. 그쪽은 각자 화면의 권한이 이미 막는다.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        StoredFile file = storage.meta(id);
        boolean mine = principal != null && principal.getUsername() != null
                && principal.getUsername().equals(file.getUploader());
        if (!mine && (principal == null || !principal.isAdmin())) {
            throw ApiException.forbidden("내가 올린 파일만 지울 수 있습니다.");
        }
        storage.delete(id);
        return ResponseEntity.noContent().build();
    }

    public record FileMeta(Long id, String name, String contentType, long sizeBytes, String uploader) {
        public static FileMeta from(StoredFile f) {
            return new FileMeta(f.getId(), f.getName(), f.getContentType(), f.getSizeBytes(), f.getUploader());
        }
    }
}

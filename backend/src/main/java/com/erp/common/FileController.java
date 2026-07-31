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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        storage.delete(id);
        return ResponseEntity.noContent().build();
    }

    public record FileMeta(Long id, String name, String contentType, long sizeBytes, String uploader) {
        public static FileMeta from(StoredFile f) {
            return new FileMeta(f.getId(), f.getName(), f.getContentType(), f.getSizeBytes(), f.getUploader());
        }
    }
}

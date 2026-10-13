package com.erp.groupware.drive;

import com.erp.groupware.drive.dto.DriveDtos.CreateDocumentRequest;
import com.erp.groupware.drive.dto.DriveDtos.CreateFolderRequest;
import com.erp.groupware.drive.dto.DriveDtos.DocumentResponse;
import com.erp.groupware.drive.dto.DriveDtos.UpdateDocumentRequest;
import com.erp.security.UserPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import com.erp.groupware.drive.dto.DriveDtos;

@RestController
@RequestMapping("/api/drive-documents")
@RequiredArgsConstructor
public class DriveController {

    private final DriveService driveService;

    /** 원본 [버전/이력]의 IP — 프록시 뒤면 X-Forwarded-For 의 첫 주소. */
    private static String clientIp(HttpServletRequest http) {
        String f = http.getHeader("X-Forwarded-For");
        if (f != null && !f.isBlank()) return f.split(",")[0].trim();
        return http.getRemoteAddr();
    }

    /** 원본 드라이브 머리 우클릭 [버전/이력] — 그 드라이브 전체. */
    @GetMapping("/history")
    public List<DriveDtos.HistoryResponse> driveHistory(@RequestParam(required = false, defaultValue = "MY") String drive) {
        return driveService.history(null, drive);
    }

    /** 원본 ⋮ [버전/이력] — 폴더면 안에 든 것까지. */
    @GetMapping("/{id}/history")
    public List<DriveDtos.HistoryResponse> history(@PathVariable Long id) {
        return driveService.history(id, null);
    }

    /** 원본 ⋮ [상세보기]. */
    @GetMapping("/{id}/detail")
    public DriveDtos.DetailResponse detail(@PathVariable Long id) {
        return driveService.detail(id);
    }

    @GetMapping
    public List<DocumentResponse> list(@RequestParam(required = false, defaultValue = "my") String folder,
                                       @RequestParam(required = false) Long parentId,
                                       @RequestParam(required = false, defaultValue = "false") boolean all) {
        return driveService.list(folder, parentId, all);
    }

    /** 원본 우클릭 [새 폴더]. */
    @PostMapping("/folders")
    public ResponseEntity<DocumentResponse> createFolder(
            @Valid @RequestBody CreateFolderRequest req,
            @AuthenticationPrincipal UserPrincipal principal, HttpServletRequest http) {
        return ResponseEntity.ok(driveService.createFolder(req, principal.getUsername(), clientIp(http)));
    }

    @PostMapping
    public ResponseEntity<DocumentResponse> create(
            @Valid @RequestBody CreateDocumentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(driveService.create(req, principal.getName()));
    }

    /** 실제 파일 업로드(ECDrive). 이름·크기는 올린 파일에서 가져온다. */
    @PostMapping("/upload")
    public ResponseEntity<DocumentResponse> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "MY") String drive,
            @RequestParam(required = false) Long parentId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(driveService.upload(file, drive, parentId, principal.getUsername()));
    }

    /** 다운로드는 공통 파일 엔드포인트로 넘긴다(파일 id 를 알려준다). */
    @GetMapping("/{id}/file")
    public FileRef fileRef(@PathVariable Long id) {
        return new FileRef(driveService.fileIdOf(id));
    }

    public record FileRef(Long fileId) {}

    @PatchMapping("/{id}")
    public DocumentResponse update(@PathVariable Long id, @RequestBody UpdateDocumentRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal, HttpServletRequest http) {
        return driveService.update(id, req, principal.getUsername(), clientIp(http));
    }

    /** 원본 ⋮ [이동] — 'ECDrive' 창에서 고른 폴더로 옮긴다. */
    @PostMapping("/{id}/move")
    public DocumentResponse move(@PathVariable Long id, @RequestBody DriveDtos.TransferRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal, HttpServletRequest http) {
        return driveService.move(id, req, principal.getUsername(), clientIp(http));
    }

    /** 원본 ⋮ [복사] — 폴더면 안에 든 것까지 통째로. */
    @PostMapping("/{id}/copy")
    public DocumentResponse copy(@PathVariable Long id, @RequestBody DriveDtos.TransferRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal, HttpServletRequest http) {
        return driveService.copy(id, req, principal.getUsername(), clientIp(http));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        driveService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

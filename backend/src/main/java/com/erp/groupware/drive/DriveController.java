package com.erp.groupware.drive;

import com.erp.groupware.drive.dto.DriveDtos.CreateDocumentRequest;
import com.erp.groupware.drive.dto.DriveDtos.CreateFolderRequest;
import com.erp.groupware.drive.dto.DriveDtos.DocumentResponse;
import com.erp.groupware.drive.dto.DriveDtos.UpdateDocumentRequest;
import com.erp.security.UserPrincipal;
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
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(driveService.createFolder(req, principal.getUsername()));
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
    public DocumentResponse update(@PathVariable Long id, @RequestBody UpdateDocumentRequest req) {
        return driveService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        driveService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

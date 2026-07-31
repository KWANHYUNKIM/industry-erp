package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.common.FileStorageService;
import com.erp.common.StoredFile;
import com.erp.groupware.domain.DriveDocument;
import com.erp.groupware.dto.DriveDtos.CreateDocumentRequest;
import com.erp.groupware.dto.DriveDtos.DocumentResponse;
import com.erp.groupware.dto.DriveDtos.UpdateDocumentRequest;
import com.erp.groupware.repository.DriveDocumentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import com.erp.groupware.dto.DriveDtos;

@Service
@RequiredArgsConstructor
public class DriveService {

    private final DriveDocumentRepository documentRepository;
    private final FileStorageService fileStorage;

    /** folder: my / shared / important / trash */
    @Transactional(readOnly = true)
    public List<DocumentResponse> list(String folder) {
        String f = folder != null ? folder.toLowerCase() : "my";
        return documentRepository.findAllOrdered().stream()
                .filter(d -> matchesFolder(d, f))
                .map(DocumentResponse::from)
                .toList();
    }

    private boolean matchesFolder(DriveDocument d, String folder) {
        return switch (folder) {
            case "trash" -> d.isTrashed();
            case "important" -> d.isImportant() && !d.isTrashed();
            case "shared" -> "SHARED".equalsIgnoreCase(d.getDrive()) && !d.isTrashed();
            default -> "MY".equalsIgnoreCase(d.getDrive()) && !d.isTrashed();
        };
    }

    @Transactional
    public DocumentResponse create(CreateDocumentRequest req, String uploader) {
        String drive = "SHARED".equalsIgnoreCase(req.drive()) ? "SHARED" : "MY";
        DriveDocument doc = DriveDocument.builder()
                .name(req.name())
                .drive(drive)
                .sizeBytes(req.sizeBytes() != null ? req.sizeBytes() : 0L)
                .uploader(uploader)
                .important(false)
                .trashed(false)
                .build();
        return DocumentResponse.from(documentRepository.save(doc));
    }

    @Transactional
    public DocumentResponse update(Long id, UpdateDocumentRequest req) {
        DriveDocument doc = getDoc(id);
        if (req.name() != null && !req.name().isBlank()) doc.setName(req.name());
        if (req.important() != null) doc.setImportant(req.important());
        if (req.trashed() != null) doc.setTrashed(req.trashed());
        return DocumentResponse.from(doc);
    }

    /**
     * 실제 파일을 올려 문서를 만든다. 이름·크기는 올린 파일에서 가져오므로 따로 받지 않는다.
     * (기존 {@link #create} 는 파일 없이 항목만 등록하는 경로로 남겨 둔다.)
     */
    @Transactional
    public DocumentResponse upload(MultipartFile file, String drive, String uploader) {
        StoredFile stored = fileStorage.store(file, uploader);
        DriveDocument doc = DriveDocument.builder()
                .name(stored.getName())
                .drive("SHARED".equalsIgnoreCase(drive) ? "SHARED" : "MY")
                .sizeBytes(stored.getSizeBytes())
                .uploader(uploader)
                .file(stored)
                .important(false)
                .trashed(false)
                .build();
        return DocumentResponse.from(documentRepository.save(doc));
    }

    /** 다운로드할 파일 id. 파일 없이 등록만 된 항목이면 400. */
    @Transactional(readOnly = true)
    public Long fileIdOf(Long id) {
        DriveDocument doc = getDoc(id);
        if (doc.getFile() == null) {
            throw ApiException.badRequest("이 항목에는 실제 파일이 없습니다(메타데이터만 등록됨).");
        }
        return doc.getFile().getId();
    }

    /** 문서를 지우면 붙어 있던 파일도 함께 지운다 — 참조가 사라진 바이트를 남겨둘 이유가 없다. */
    @Transactional
    public void delete(Long id) {
        DriveDocument doc = getDoc(id);
        Long fileId = doc.getFile() != null ? doc.getFile().getId() : null;
        documentRepository.delete(doc);
        if (fileId != null) {
            fileStorage.delete(fileId);
        }
    }

    private DriveDocument getDoc(Long id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("문서를 찾을 수 없습니다. id=" + id));
    }
}

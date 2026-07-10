package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.DriveDocument;
import com.erp.dto.DriveDtos.CreateDocumentRequest;
import com.erp.dto.DriveDtos.DocumentResponse;
import com.erp.dto.DriveDtos.UpdateDocumentRequest;
import com.erp.repository.DriveDocumentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DriveService {

    private final DriveDocumentRepository documentRepository;

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

    @Transactional
    public void delete(Long id) {
        documentRepository.delete(getDoc(id));
    }

    private DriveDocument getDoc(Long id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("문서를 찾을 수 없습니다. id=" + id));
    }
}

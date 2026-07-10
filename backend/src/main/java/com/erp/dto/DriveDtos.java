package com.erp.dto;

import com.erp.domain.DriveDocument;
import jakarta.validation.constraints.NotBlank;

public final class DriveDtos {

    private DriveDtos() {}

    public record CreateDocumentRequest(
            @NotBlank(message = "문서 이름을 입력하세요.") String name,
            String drive,
            Long sizeBytes,
            String category,
            String version
    ) {}

    public record UpdateDocumentRequest(
            String name,
            Boolean important,
            Boolean trashed
    ) {}

    public record DocumentResponse(
            Long id, String name, String drive, long sizeBytes,
            String uploader, boolean important, boolean trashed,
            String updatedAt
    ) {
        public static DocumentResponse from(DriveDocument d) {
            return new DocumentResponse(
                    d.getId(), d.getName(), d.getDrive(), d.getSizeBytes(),
                    d.getUploader(), d.isImportant(), d.isTrashed(),
                    d.getUpdatedAt() != null ? d.getUpdatedAt().toString() : null);
        }
    }
}

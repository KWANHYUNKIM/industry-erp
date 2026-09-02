package com.erp.groupware.dto;

import com.erp.groupware.domain.DriveDocument;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

public final class DriveDtos {

    private DriveDtos() {}

    public record CreateDocumentRequest(
            @Size(max = 200, message = "문서 이름은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "문서 이름을 입력하세요.") String name,
            String drive,
            Long sizeBytes,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String category,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String version
    ) {}

    public record UpdateDocumentRequest(
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String name,
            Boolean important,
            Boolean trashed
    ) {}

    public record DocumentResponse(
            Long id, String name, String drive, long sizeBytes,
            String uploader, boolean important, boolean trashed,
            String updatedAt,
            /** 실제 파일 id. null 이면 메타데이터만 등록된 항목이라 다운로드할 수 없다. */
            Long fileId
    ) {
        public static DocumentResponse from(DriveDocument d) {
            return new DocumentResponse(
                    d.getId(), d.getName(), d.getDrive(), d.getSizeBytes(),
                    d.getUploader(), d.isImportant(), d.isTrashed(),
                    d.getUpdatedAt() != null ? d.getUpdatedAt().toString() : null,
                    d.getFile() != null ? d.getFile().getId() : null);
        }
    }
}

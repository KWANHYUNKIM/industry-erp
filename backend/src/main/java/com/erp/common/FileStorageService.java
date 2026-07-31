package com.erp.common;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 파일 저장소. 업로드 바이트를 DB(bytea)에 넣고 메타데이터 핸들({@link StoredFile})을 돌려준다.
 *
 * 어떤 모듈이든 이 서비스만 거치면 파일을 붙일 수 있다(ECDrive 문서, 전표 증빙, 생성한 보고파일).
 * 파일을 소유한 쪽이 접근 규칙을 갖고, 여기서는 크기 상한만 강제한다.
 */
@Service
@RequiredArgsConstructor
public class FileStorageService {

    /** 파일 하나의 상한. ERP 증빙·양식은 이 아래다. 넘으면 저장하지 않고 400 으로 돌려보낸다. */
    public static final long MAX_FILE_BYTES = 10L * 1024 * 1024;

    private final StoredFileRepository fileRepository;
    private final StoredFileDataRepository dataRepository;

    @Transactional
    public StoredFile store(MultipartFile upload, String uploader) {
        if (upload == null || upload.isEmpty()) {
            throw ApiException.badRequest("업로드할 파일을 선택하세요.");
        }
        if (upload.getSize() > MAX_FILE_BYTES) {
            throw ApiException.badRequest("파일이 너무 큽니다. 최대 "
                    + (MAX_FILE_BYTES / 1024 / 1024) + "MB 까지 올릴 수 있습니다.");
        }
        byte[] bytes;
        try {
            bytes = upload.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("파일을 읽지 못했습니다: " + e.getMessage());
        }
        return save(safeName(upload.getOriginalFilename()), upload.getContentType(), bytes, uploader);
    }

    /** 서버가 만들어낸 파일(예: 보고파일 CSV)을 저장한다. */
    @Transactional
    public StoredFile storeText(String name, String contentType, String content, String uploader) {
        return save(name, contentType, content.getBytes(StandardCharsets.UTF_8), uploader);
    }

    private StoredFile save(String name, String contentType, byte[] bytes, String uploader) {
        StoredFile meta = fileRepository.save(StoredFile.builder()
                .name(name)
                .contentType(contentType != null ? contentType : "application/octet-stream")
                .sizeBytes(bytes.length)
                .uploader(uploader)
                .build());
        dataRepository.save(StoredFileData.builder().file(meta).data(bytes).build());
        return meta;
    }

    @Transactional(readOnly = true)
    public StoredFile meta(Long id) {
        return fileRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("파일을 찾을 수 없습니다. id=" + id));
    }

    /** 다운로드용 바이트. 이 메서드에서만 파일 전체를 읽는다. */
    @Transactional(readOnly = true)
    public byte[] load(Long id) {
        return dataRepository.findById(id)
                .map(StoredFileData::getData)
                .orElseThrow(() -> ApiException.notFound("파일 내용을 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public void delete(Long id) {
        dataRepository.deleteById(id);
        fileRepository.deleteById(id);
    }

    /** 경로가 섞여 들어오는 브라우저(옛 IE 등) 대비 — 파일명만 남긴다. */
    private String safeName(String original) {
        if (original == null || original.isBlank()) {
            return "unnamed";
        }
        String n = original.replace('\\', '/');
        int slash = n.lastIndexOf('/');
        String base = slash >= 0 ? n.substring(slash + 1) : n;
        return base.length() > 260 ? base.substring(base.length() - 260) : base;
    }
}

package com.erp.groupware.drive;

import com.erp.common.ApiException;
import com.erp.common.FileStorageService;
import com.erp.common.StoredFile;
import com.erp.groupware.drive.dto.DriveDtos.CreateDocumentRequest;
import com.erp.groupware.drive.dto.DriveDtos.CreateFolderRequest;
import com.erp.groupware.drive.dto.DriveDtos.DocumentResponse;
import com.erp.groupware.drive.dto.DriveDtos.UpdateDocumentRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import com.erp.groupware.drive.dto.DriveDtos;

@Service
@RequiredArgsConstructor
public class DriveService {

    private final DriveDocumentRepository documentRepository;
    private final FileStorageService fileStorage;

    /** folder: my / shared / important / trash */
    @Transactional(readOnly = true)
    public List<DocumentResponse> list(String folder) {
        return list(folder, null, false);
    }

    /**
     * My Drive · Shared Drive 는 <b>그 폴더 바로 안</b>(parentId, 없으면 최상위)만 낸다. all 이면 폴더 안까지 전부
     * (사용용량 · 나무 그리기용). 휴지통 · 중요문서함은 폴더와 상관없이 전부.
     */
    @Transactional(readOnly = true)
    public List<DocumentResponse> list(String folder, Long parentId, boolean all) {
        String f = folder != null ? folder.toLowerCase() : "my";
        boolean byParent = !all && ("my".equals(f) || "shared".equals(f));
        return documentRepository.findAllOrdered().stream()
                .filter(d -> matchesFolder(d, f))
                .filter(d -> !byParent || java.util.Objects.equals(d.getParent() != null ? d.getParent().getId() : null, parentId))
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

    /** 원본 우클릭 [새 폴더] → '새 폴더' 창의 [저장(F8)]. 폴더 안에 폴더도 만든다. */
    @Transactional
    public DocumentResponse createFolder(CreateFolderRequest req, String uploader) {
        DriveDocument parent = req.parentId() != null ? getDoc(req.parentId()) : null;
        if (parent != null && !parent.isFolder()) throw ApiException.badRequest("폴더 안에만 폴더를 만들 수 있습니다.");
        DriveDocument doc = DriveDocument.builder()
                .name(req.name().trim())
                .drive(parent != null ? parent.getDrive() : ("SHARED".equalsIgnoreCase(req.drive()) ? "SHARED" : "MY"))
                .sizeBytes(0L)
                .uploader(uploader)
                .important(false)
                .trashed(false)
                .folder(true)
                .parent(parent)
                .build();
        return DocumentResponse.from(documentRepository.save(doc));
    }

    @Transactional
    public DocumentResponse update(Long id, UpdateDocumentRequest req) {
        DriveDocument doc = getDoc(id);
        if (req.name() != null) {
            /* 원본 이름변경 창은 비우고 [저장(F8)] 하면 '이름을 입력 바랍니다.' */
            if (req.name().isBlank()) throw ApiException.badRequest("이름을 입력 바랍니다.");
            if (doc.isFolder() && req.name().trim().length() > 50) throw ApiException.badRequest("최대 50자까지 입력 가능합니다.");
            doc.setName(req.name().trim());
        }
        if (req.important() != null) doc.setImportant(req.important());
        /* 폴더를 휴지통에 넣거나 꺼내면 안에 든 것도 같이 간다 — 원본 휴지통도 폴더째 옮긴다. */
        if (req.trashed() != null) for (DriveDocument d : withChildren(doc)) d.setTrashed(req.trashed());
        return DocumentResponse.from(doc);
    }

    /**
     * 원본 [이동] · [복사] 가 받아 주는 곳인지 본다(2026-10-12 loginaa ECDrive 실측).
     * <ul>
     *   <li>지금 들어 있는 곳 그대로 → '동일 폴더로는 이동/복사가 불가합니다.'</li>
     *   <li>자기 자신 · 자기 안의 폴더, Shared Drive 맨 위 → '해당 위치로 이동/복사가 불가합니다.'</li>
     * </ul>
     */
    private DriveDocument checkTarget(DriveDocument doc, DriveDtos.TransferRequest req) {
        DriveDocument target = req.parentId() != null ? getDoc(req.parentId()) : null;
        if (target != null && (!target.isFolder() || target.isTrashed())) throw ApiException.badRequest("해당 위치로 이동/복사가 불가합니다.");
        String drive = target != null ? target.getDrive() : ("SHARED".equalsIgnoreCase(req.drive()) ? "SHARED" : "MY");
        if (target == null && "SHARED".equals(drive)) throw ApiException.badRequest("해당 위치로 이동/복사가 불가합니다.");
        Long curParent = doc.getParent() != null ? doc.getParent().getId() : null;
        Long newParent = target != null ? target.getId() : null;
        if (java.util.Objects.equals(curParent, newParent) && drive.equalsIgnoreCase(doc.getDrive())) {
            throw ApiException.badRequest("동일 폴더로는 이동/복사가 불가합니다.");
        }
        if (target != null && doc.isFolder()) {
            for (DriveDocument d : withChildren(doc)) {
                if (d.getId().equals(target.getId())) throw ApiException.badRequest("해당 위치로 이동/복사가 불가합니다.");
            }
        }
        return target;
    }

    /** 고른 곳 바로 안에 같은 이름의 폴더가 있으면 그 폴더(원본은 옮긴 폴더를 그 폴더에 합친다). */
    private DriveDocument sameNameFolder(String drive, DriveDocument target, String name, Long exceptId) {
        Long pid = target != null ? target.getId() : null;
        return documentRepository.findAllOrdered().stream()
                .filter(d -> d.isFolder() && !d.isTrashed() && !d.getId().equals(exceptId))
                .filter(d -> drive.equalsIgnoreCase(d.getDrive()))
                .filter(d -> java.util.Objects.equals(d.getParent() != null ? d.getParent().getId() : null, pid))
                .filter(d -> d.getName().equals(name))
                .findFirst().orElse(null);
    }

    /**
     * 원본 [이동]. 폴더는 안에 든 것까지 같이 간다. 고른 곳에 같은 이름의 폴더가 이미 있으면
     * 옮긴 폴더의 내용이 그 폴더로 합쳐진다(실측: My Drive 에 'QA그룹웨어-폴더3' 이 있는데 같은 이름을
     * 옮겨 오니 목록에 한 줄만 남았다).
     */
    @Transactional
    public DocumentResponse move(Long id, DriveDtos.TransferRequest req) {
        DriveDocument doc = getDoc(id);
        DriveDocument target = checkTarget(doc, req);
        String drive = target != null ? target.getDrive() : "MY";
        return DocumentResponse.from(moveInto(doc, target, drive));
    }

    private DriveDocument moveInto(DriveDocument doc, DriveDocument target, String drive) {
        DriveDocument same = doc.isFolder() ? sameNameFolder(drive, target, doc.getName(), doc.getId()) : null;
        if (same == null) {
            for (DriveDocument d : withChildren(doc)) d.setDrive(drive);
            doc.setParent(target);
            return doc;
        }
        List<DriveDocument> kids = documentRepository.findAllOrdered().stream()
                .filter(d -> d.getParent() != null && d.getParent().getId().equals(doc.getId())).toList();
        for (DriveDocument k : kids) moveInto(k, same, drive);
        documentRepository.flush();
        documentRepository.delete(doc);
        return same;
    }

    /** 원본 [복사]. 폴더면 안에 든 것까지 새로 만들고, 파일은 바이트까지 따로 둔다(원본을 지워도 사본은 남는다). */
    @Transactional
    public DocumentResponse copy(Long id, DriveDtos.TransferRequest req, String uploader) {
        DriveDocument doc = getDoc(id);
        DriveDocument target = checkTarget(doc, req);
        String drive = target != null ? target.getDrive() : "MY";
        return DocumentResponse.from(copyInto(doc, target, drive, uploader));
    }

    private DriveDocument copyInto(DriveDocument src, DriveDocument target, String drive, String uploader) {
        DriveDocument same = src.isFolder() ? sameNameFolder(drive, target, src.getName(), null) : null;
        DriveDocument made = same;
        if (made == null) {
            made = documentRepository.save(DriveDocument.builder()
                    .name(src.getName()).drive(drive).category(src.getCategory()).version(src.getVersion())
                    .sizeBytes(src.getSizeBytes()).uploader(uploader)
                    .file(src.getFile() != null ? fileStorage.duplicate(src.getFile().getId(), uploader) : null)
                    .important(false).trashed(false).folder(src.isFolder()).parent(target)
                    .build());
        }
        if (src.isFolder()) {
            List<DriveDocument> kids = documentRepository.findAllOrdered().stream()
                    .filter(d -> d.getParent() != null && d.getParent().getId().equals(src.getId()) && !d.isTrashed()).toList();
            for (DriveDocument k : kids) copyInto(k, made, drive, uploader);
        }
        return made;
    }

    /** 이 항목과, 폴더면 그 안에 든 것 전부(깊이 우선, 자기 자신이 맨 앞). */
    private List<DriveDocument> withChildren(DriveDocument root) {
        List<DriveDocument> all = documentRepository.findAllOrdered();
        List<DriveDocument> out = new java.util.ArrayList<>();
        java.util.ArrayDeque<DriveDocument> stack = new java.util.ArrayDeque<>();
        stack.push(root);
        while (!stack.isEmpty()) {
            DriveDocument cur = stack.pop();
            out.add(cur);
            if (cur.isFolder()) {
                for (DriveDocument d : all) {
                    if (d.getParent() != null && d.getParent().getId().equals(cur.getId())) stack.push(d);
                }
            }
        }
        return out;
    }

    /**
     * 실제 파일을 올려 문서를 만든다. 이름·크기는 올린 파일에서 가져오므로 따로 받지 않는다.
     * (기존 {@link #create} 는 파일 없이 항목만 등록하는 경로로 남겨 둔다.)
     */
    @Transactional
    public DocumentResponse upload(MultipartFile file, String drive, String uploader) {
        return upload(file, drive, null, uploader);
    }

    /** 폴더 안에 올리면 그 폴더의 드라이브를 따른다. */
    @Transactional
    public DocumentResponse upload(MultipartFile file, String drive, Long parentId, String uploader) {
        DriveDocument parent = parentId != null ? getDoc(parentId) : null;
        if (parent != null && !parent.isFolder()) throw ApiException.badRequest("폴더 안에만 올릴 수 있습니다.");
        if (parent != null) drive = parent.getDrive();
        StoredFile stored = fileStorage.store(file, uploader);
        /* 붙는 순간 이 파일의 주인을 적는다 — 내려받기를 이 코드로 막는다. */
        stored.setOwnerCode("GROUPWARE");
        DriveDocument doc = DriveDocument.builder()
                .name(stored.getName())
                .drive("SHARED".equalsIgnoreCase(drive) ? "SHARED" : "MY")
                .sizeBytes(stored.getSizeBytes())
                .uploader(uploader)
                .file(stored)
                .important(false)
                .trashed(false)
                .parent(parent)
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
        /* 폴더면 안에 든 것부터(자식 → 부모 차례로) 지운다 — parent_id 외래키가 걸려 있다. */
        List<DriveDocument> targets = withChildren(getDoc(id));
        java.util.Collections.reverse(targets);
        for (DriveDocument doc : targets) {
            Long fileId = doc.getFile() != null ? doc.getFile().getId() : null;
            documentRepository.delete(doc);
            documentRepository.flush();
            if (fileId != null) {
                fileStorage.delete(fileId);
            }
        }
    }

    private DriveDocument getDoc(Long id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("문서를 찾을 수 없습니다. id=" + id));
    }
}

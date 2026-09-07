package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;
import com.erp.common.StoredFile;

/**
 * ECDrive 문서 항목. 메타데이터(이름/드라이브/크기/중요/휴지통) + 실제 파일({@link StoredFile}).
 * file 이 null 이면 파일 없이 등록만 된 항목이다(V120 이전에 만들어진 행).
 */
@Entity
@Table(name = "drive_documents")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DriveDocument extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    /** 드라이브 구분: MY(내 드라이브) / SHARED(공유 드라이브) / DOWNLOAD(다운로드 자료실) */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String drive = "MY";

    /** 자료 분류(다운로드 자료실용: 프로그램/엑셀양식/매뉴얼 등) */
    @Column(length = 50)
    private String category;

    /** 자료 버전(다운로드 자료실용, 예: v1.4.2) */
    @Column(name = "file_version", length = 30)
    private String version;

    /** 파일 크기(byte) */
    @Column(nullable = false)
    @Builder.Default
    private long sizeBytes = 0L;

    @Column(length = 50)
    private String uploader;

    /** 중요문서함 표시 */
    @Column(nullable = false)
    @Builder.Default
    private boolean important = false;

    /** 실제 업로드된 파일. null 이면 메타데이터만 있는 항목(다운로드 불가). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_id")
    private StoredFile file;

    /** 휴지통 이동 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean trashed = false;
}

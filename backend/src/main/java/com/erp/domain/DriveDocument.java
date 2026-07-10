package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * ECDrive 문서 항목. 실제 바이너리 저장 없이 문서 메타데이터(이름/드라이브/크기/중요/휴지통)를 관리.
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

    /** 휴지통 이동 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean trashed = false;
}

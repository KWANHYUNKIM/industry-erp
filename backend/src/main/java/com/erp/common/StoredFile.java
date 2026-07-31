package com.erp.common;

import jakarta.persistence.*;
import lombok.*;

/**
 * 업로드된 파일의 <b>메타데이터</b>. 실제 바이트는 {@link StoredFileData} 에 따로 있다.
 *
 * 바이트를 같은 테이블에 두면 목록 조회 한 번에 파일 전체가 메모리로 올라온다(byte[] 는 지연로딩이
 * 바이트코드 강화 없이는 동작하지 않는다). 그래서 메타/데이터를 나누고, 다운로드할 때만 데이터를 읽는다.
 *
 * 저장소를 Postgres 로 정한 이유: 회사별 스키마 멀티테넌시라 DB 에 넣으면 테넌트 격리와 백업 일관성이
 * 그대로 따라온다. 파일시스템이면 경로 규칙·정리·백업을 따로 만들어야 한다. 오브젝트 스토리지로 옮기게 되면
 * 이 클래스가 경계라서 교체 지점이 한 곳으로 모인다.
 */
@Entity
@Table(name = "stored_files")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StoredFile extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 원본 파일명 */
    @Column(nullable = false, length = 260)
    private String name;

    @Column(name = "content_type", length = 120)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(length = 50)
    private String uploader;
}

package com.erp.common;

import jakarta.persistence.*;
import lombok.*;

/**
 * 파일 바이트. {@link StoredFile} 과 1:1 이며 <b>다운로드할 때만</b> 읽는다.
 * 목록 화면이 실수로 파일 전체를 끌어오지 못하도록 테이블을 분리해 둔 것이다.
 */
@Entity
@Table(name = "stored_file_data")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StoredFileData {

    /** stored_files.id 와 같은 값을 쓴다(@MapsId) */
    @Id
    private Long id;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id")
    private StoredFile file;

    /** Postgres bytea. @Lob 을 붙이면 oid(대용량 객체)로 매핑돼 다루기 까다로워지므로 쓰지 않는다. */
    @Column(nullable = false, columnDefinition = "bytea")
    private byte[] data;
}

package com.erp.groupware.drive;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * ECDrive [버전/이력] 한 줄 — 원본 E077100 '버전/이력' 창(2026-10-13 loginaa 실측).
 * 작업일자 · 행위(생성 · 이름변경 · 이동 · 복사(T)) · 이름 · 크기 · 작업자 · 파일관리 · IP · 위치.
 * 이름 · 위치는 <b>그때의 값</b>을 적어 둔다(이름을 바꿔도 '생성' 줄은 옛 이름 그대로).
 */
@Entity
@Table(name = "drive_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DriveHistory extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 이 줄이 가리키는 폴더/파일. 문서를 지우면 이력도 함께 지워진다(ON DELETE CASCADE). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id")
    private DriveDocument document;

    /** 원본 [행위] 글자 그대로 — 생성 · 이름변경 · 이동 · 복사(T) */
    @Column(nullable = false, length = 20)
    private String action;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(length = 50)
    private String actor;

    @Column(length = 45)
    private String ip;

    /** 원본 [위치] — 들어 있는 폴더 경로('/QA그룹웨어-폴더'). 드라이브 맨 위면 빈칸. */
    @Column(length = 500)
    private String location;
}

package com.erp.groupware.workpost;

import com.erp.auth.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 게시글을 누가 언제 읽었나 — 원본 [조회] 'R' → '조회자 현황'의 [최초조회일시][최종조회일시].
 * 사람마다 한 줄이다(post · user 유니크).
 */
@Entity
@Table(name = "work_post_reads")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkPostRead {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "post_id", nullable = false)
    private WorkPost post;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "first_read_at", nullable = false)
    private LocalDateTime firstReadAt;

    @Column(name = "last_read_at", nullable = false)
    private LocalDateTime lastReadAt;
}

package com.erp.auth.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 사용자별 북마크(즐겨찾기).
 *
 * <p>원본은 상단에 북마크바가 있고 [즐겨찾기]로 지금 화면을 담거나 뺀다. 사람마다 매일
 * 여는 화면이 다르다. 우리 북마크바는 코드에 박힌 6개였다 — 아무도 바꿀 수 없으니
 * 자기 화면을 담을 수 없고, 담을 수 없으니 쓰지 않게 된다.
 *
 * <p><b>회사 공통 설정(Preference)에 두지 않았다.</b> 거기 넣으면 한 사람이 고친 것이
 * 온 회사에 적용된다.
 */
@Entity
@Table(name = "user_bookmarks",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_bookmarks_user_path",
                columnNames = {"user_id", "path"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserBookmark extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** 북마크바에 찍히는 이름. 메뉴 이름을 그대로 담는다. */
    @Column(nullable = false, length = 100)
    private String label;

    /** 갈 곳. 같은 사용자 안에서 유일하다 — 같은 화면을 두 번 담을 이유가 없다. */
    @Column(nullable = false, length = 200)
    private String path;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}

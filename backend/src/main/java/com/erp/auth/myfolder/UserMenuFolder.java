package com.erp.auth.myfolder;

import com.erp.auth.user.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * MyPage 의 나만의 업무 폴더.
 *
 * <p>원본 MyPage 는 업무 폴더가 2단 메뉴다 — [나만의 업무 폴더] 와 업종 예시 넷. 폴더를 고르면 그 안에 담은
 * 화면들이 왼쪽 메뉴로 펼쳐지고 첫 화면이 열린다. 사람마다 매일 여는 화면이 달라서 사용자별로 둔다
 * (북마크와 같은 까닭 — {@link com.erp.auth.bookmark.UserBookmark}).
 */
@Entity
@Table(name = "user_menu_folders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserMenuFolder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** 2단 메뉴에 찍히는 폴더 이름. */
    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}

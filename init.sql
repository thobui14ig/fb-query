CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    expired_at TIMESTAMP NOT NULL,
    link_on_limit INT DEFAULT NULL,
    link_off_limit INT DEFAULT NULL,
    level INT DEFAULT 0, -- 0: USER, 1: ADMIN
    delay_on_private INT DEFAULT 5,
    link_on_hide_limit INT DEFAULT 0,
    get_phone TINYINT(1) DEFAULT 1,
    account_fb_uuid VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    link_name VARCHAR(255),
    content TEXT,
    link_url VARCHAR(255) NOT NULL,
    post_id VARCHAR(255),
    post_id_v1 VARCHAR(255),
    page_id VARCHAR(255),
    last_comment_time TIMESTAMP NULL,
    time_craw_update TIMESTAMP NULL,
    comment_count INT DEFAULT 0,
    delay_time INT DEFAULT 0,
    `like` INT DEFAULT 0,
    status ENUM('pending','started') NOT NULL DEFAULT 'pending',
    type ENUM('die','undefined','public','private') NOT NULL,
    error_message VARCHAR(255),
    process TINYINT(1) DEFAULT 0,
    count_before INT NOT NULL,
    count_after INT NOT NULL,
    like_before INT NOT NULL,
    like_after INT NOT NULL,
    hide_cmt TINYINT(1) NOT NULL,
    hide_by ENUM('all','phone','keywords') NOT NULL DEFAULT 'all',
    post_id_die TINYINT(1) NOT NULL,
    post_id_v1_die TINYINT(1) NOT NULL,
    thread INT NOT NULL,
    priority TINYINT(0) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_links_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE token (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_value VARCHAR(255) NOT NULL,
    token_value_v1 VARCHAR(255) NOT NULL,
    status ENUM('active','inactive','limit','die') NOT NULL DEFAULT 'active',
    type SMALLINT NOT NULL DEFAULT 1,
    retry_count INT DEFAULT 0
);

CREATE TABLE delay (
    id INT AUTO_INCREMENT PRIMARY KEY,
    refresh_cookie INT DEFAULT 0,
    updated_at TIMESTAMP NOT NULL,
    refresh_token INT DEFAULT 0,
    refresh_proxy INT DEFAULT 0,
    delay_on_public INT DEFAULT 0,
    delay_off_private INT DEFAULT 0,
    delay_off INT DEFAULT 0,
    delay_comment_count INT DEFAULT 0,
    time_remove_proxy_slow INT DEFAULT 0
);

CREATE TABLE keywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    keyword VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INT NOT NULL,
    link_id INT NOT NULL,
    CONSTRAINT fk_keywords_link FOREIGN KEY (link_id) REFERENCES links(id)
);

CREATE TABLE proxy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proxy_address VARCHAR(100) NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    is_fb_block TINYINT(1) NOT NULL DEFAULT 0,
    error_code VARCHAR(255)
);

CREATE TABLE cookie (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cookie TEXT NOT NULL,
    created_by INT NOT NULL,
    fb_id VARCHAR(255) NOT NULL,
    fb_dtsg VARCHAR(255) NOT NULL,
    jazoest VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    status ENUM('active','inactive','limit','die') NOT NULL DEFAULT 'active',
    CONSTRAINT fk_cookie_user FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id VARCHAR(255) NOT NULL,
    user_id INT NOT NULL,
    uid VARCHAR(255),
    name VARCHAR(255),
    message TEXT,
    time_created TIMESTAMP NULL,
    phone_number VARCHAR(255),
    cmtid VARCHAR(255) NOT NULL,
    link_id INT NOT NULL,
    hide_cmt TINYINT(1) NOT NULL,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_comments_link FOREIGN KEY (link_id) REFERENCES links(id)
);

CREATE TABLE logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(255),
    params TEXT
);

CREATE TABLE pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_by INT NOT NULL
);

CREATE SEQUENCE tmp_uploaded_file_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE tmp_uploaded_file (
    id BIGINT PRIMARY KEY DEFAULT nextval('tmp_uploaded_file_id_seq'),
    fileExt VARCHAR(7) NOT NULL,
    path_relative_to_tmp_folder VARCHAR(128) NOT NULL,
    original_filename VARCHAR(127) NULL,
    original_filename_extension VARCHAR(7) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) WITH (FILLFACTOR = 75);

ALTER SEQUENCE tmp_uploaded_file_id_seq OWNED BY tmp_uploaded_file.id;


CREATE TABLE unconverted_videos(
    str_id VARCHAR(96) NOT NULL UNIQUE,

    source_tmp_file_id BIGINT,

    CONSTRAINT fk_source_tmp_file_id_
        FOREIGN KEY(source_tmp_file_id)
        REFERENCES tmp_uploaded_file(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,


    title VARCHAR(255) NOT NULL DEFAULT '',
    description VARCHAR(1500) NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    state SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE unconverted_videos_data(
    source_tmp_file_id BIGINT, PRIMARY KEY(source_tmp_file_id),
    CONSTRAINT fk_source_tmp_file_id_video_conversion_queue
        FOREIGN KEY(source_tmp_file_id)
        REFERENCES tmp_uploaded_file(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    duration BIGINT NULL,
    video_stream_i SMALLINT NULL,
    audio_stream_i SMALLINT NULL,
    thumb_img VARCHAR(255) NULL
);

CREATE TABLE unconverted_videos_raw_ffmpeg_probe_data(
    source_tmp_file_id BIGINT, PRIMARY KEY(source_tmp_file_id),
    CONSTRAINT fk_source_tmp_file_id_video_conversion_queue
        FOREIGN KEY(source_tmp_file_id)
        REFERENCES tmp_uploaded_file(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    ffmpeg_probe_data TEXT NOT NULL DEFAULT ''
);

CREATE TABLE unconverted_videos_convert_to_fragmented_mp4(
    source_tmp_file_id BIGINT, PRIMARY KEY(source_tmp_file_id),
    CONSTRAINT fk_source_tmp_file_id_video_conversion_queue
        FOREIGN KEY(source_tmp_file_id)
        REFERENCES tmp_uploaded_file(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    output_file VARCHAR(255) NULL,
    mse_codec VARCHAR(127) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE video_conversion_job(
    source_tmp_file_id BIGINT,
    CONSTRAINT fk_source_tmp_file_id_video_conversion_queue
        FOREIGN KEY(source_tmp_file_id)
        REFERENCES tmp_files(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    state SMALLINT NOT NULL DEFAULT 0
);


------------------------------------------------------------

CREATE SEQUENCE converted_video_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE converted_video (
    id BIGINT PRIMARY KEY DEFAULT nextval('converted_video_id_seq'),
    fileExt VARCHAR(7) NOT NULL,
    path_relative VARCHAR(128) NOT NULL,
    fullPath VARCHAR(512) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
) WITH (FILLFACTOR = 75);

ALTER SEQUENCE converted_video_id_seq OWNED BY converted_video.id;






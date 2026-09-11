CREATE TABLE `users` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('PATIENT', 'DOCTOR') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `specialties` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `specialties_name_key` (`name`)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `doctor_profiles` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `specialty_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `doctor_profiles_user_id_key` (`user_id`),
  KEY `doctor_profiles_specialty_id_idx` (`specialty_id`),

  CONSTRAINT `doctor_profiles_user_id_fkey`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT `doctor_profiles_specialty_id_fkey`
    FOREIGN KEY (`specialty_id`)
    REFERENCES `specialties` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `visits` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `specialty_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  `selected_bid_id`
    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,

  `assigned_doctor_profile_id`
    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,

  `reserved_doctor_profile_id`
    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,

  `location` VARCHAR(255) NOT NULL,
  `preferred_at` DATETIME(3) NOT NULL,
  `scheduled_end_at` DATETIME(3) NOT NULL,

  `doctor_reservation_expires_at`
    DATETIME(3) NULL,

  `status`
    ENUM('OPEN', 'BIDDING', 'PAID', 'ASSIGNED')
    NOT NULL
    DEFAULT 'OPEN',

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE KEY `visits_selected_bid_id_key`
    (`selected_bid_id`),

  KEY `visits_patient_id_idx`
    (`patient_id`),

  KEY `visits_specialty_id_status_idx`
    (`specialty_id`, `status`),

  KEY `visits_assigned_doctor_profile_id_idx`
    (`assigned_doctor_profile_id`),

  KEY `visits_reserved_doctor_profile_id_idx`
    (`reserved_doctor_profile_id`),

  KEY `visits_reservation_expiry_idx`
    (`doctor_reservation_expires_at`),

  KEY `visits_patient_schedule_idx`
    (`patient_id`, `preferred_at`, `scheduled_end_at`),

  KEY `visits_reserved_doctor_schedule_idx`
    (
      `reserved_doctor_profile_id`,
      `preferred_at`,
      `scheduled_end_at`
    ),

  KEY `visits_assigned_doctor_schedule_idx`
    (
      `assigned_doctor_profile_id`,
      `preferred_at`,
      `scheduled_end_at`
    ),

  CONSTRAINT `visits_valid_schedule_check`
    CHECK (`scheduled_end_at` > `preferred_at`),

  CONSTRAINT `visits_patient_id_fkey`
    FOREIGN KEY (`patient_id`)
    REFERENCES `users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `visits_specialty_id_fkey`
    FOREIGN KEY (`specialty_id`)
    REFERENCES `specialties` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `visits_assigned_doctor_fkey`
    FOREIGN KEY (`assigned_doctor_profile_id`)
    REFERENCES `doctor_profiles` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT `visits_reserved_doctor_fkey`
    FOREIGN KEY (`reserved_doctor_profile_id`)
    REFERENCES `doctor_profiles` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `bids` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `visit_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `doctor_profile_id`
    CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  `amount_in_kobo` INT UNSIGNED NOT NULL,
  `note` VARCHAR(280) NOT NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE KEY `bids_visit_doctor_key`
    (`visit_id`, `doctor_profile_id`),

  KEY `bids_visit_id_idx`
    (`visit_id`),

  KEY `bids_doctor_profile_id_idx`
    (`doctor_profile_id`),

  CONSTRAINT `bids_positive_amount_check`
    CHECK (`amount_in_kobo` > 0),

  CONSTRAINT `bids_visit_id_fkey`
    FOREIGN KEY (`visit_id`)
    REFERENCES `visits` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT `bids_doctor_profile_id_fkey`
    FOREIGN KEY (`doctor_profile_id`)
    REFERENCES `doctor_profiles` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


ALTER TABLE `visits`
  ADD CONSTRAINT `visits_selected_bid_id_fkey`
  FOREIGN KEY (`selected_bid_id`)
  REFERENCES `bids` (`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;


CREATE TABLE `payments` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `visit_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `bid_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  `provider_reference` VARCHAR(100) NOT NULL,
  `amount_in_kobo` INT UNSIGNED NOT NULL,

  `status`
    ENUM('PENDING', 'SUCCEEDED', 'FAILED')
    NOT NULL
    DEFAULT 'PENDING',

  `paid_at` DATETIME(3) NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE KEY `payments_visit_id_key`
    (`visit_id`),

  UNIQUE KEY `payments_bid_id_key`
    (`bid_id`),

  UNIQUE KEY `payments_provider_reference_key`
    (`provider_reference`),

  CONSTRAINT `payments_positive_amount_check`
    CHECK (`amount_in_kobo` > 0),

  CONSTRAINT `payments_visit_id_fkey`
    FOREIGN KEY (`visit_id`)
    REFERENCES `visits` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `payments_bid_id_fkey`
    FOREIGN KEY (`bid_id`)
    REFERENCES `bids` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `webhook_events` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `provider_event_id` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payload` JSON NOT NULL,
  `processed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE KEY `webhook_events_provider_event_id_key`
    (`provider_event_id`)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `visit_status_history` (
  `id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `visit_id` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  `from_status`
    ENUM('OPEN', 'BIDDING', 'PAID', 'ASSIGNED')
    NULL,

  `to_status`
    ENUM('OPEN', 'BIDDING', 'PAID', 'ASSIGNED')
    NOT NULL,

  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  KEY `visit_status_history_visit_created_idx`
    (`visit_id`, `created_at`),

  CONSTRAINT `visit_status_history_visit_id_fkey`
    FOREIGN KEY (`visit_id`)
    REFERENCES `visits` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `sessions` (
  `sid` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sess` JSON NOT NULL,
  `expire` DATETIME(3) NOT NULL,

  PRIMARY KEY (`sid`),
  KEY `sessions_expire_idx` (`expire`)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
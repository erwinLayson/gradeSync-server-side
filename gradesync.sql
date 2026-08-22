-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 24, 2026 at 12:18 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `gradesync`
--

-- --------------------------------------------------------

--
-- Table structure for table `academic_settings`
--

CREATE TABLE `academic_settings` (
  `id` int(11) NOT NULL,
  `currentQuarter` tinyint(1) NOT NULL DEFAULT 1,
  `enrollmentOpen` tinyint(1) NOT NULL DEFAULT 1,
  `submissionsLocked` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `academic_settings`
--

INSERT INTO `academic_settings` (`id`, `currentQuarter`, `enrollmentOpen`, `submissionsLocked`, `updated_at`) VALUES
(1, 1, 1, 0, '2026-08-22 04:37:45');

-- --------------------------------------------------------

--
-- Table structure for table `assessments`
--

CREATE TABLE `assessments` (
  `id` bigint(20) NOT NULL,
  `classSubjectId` bigint(20) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `type` enum('written_work','performance_task','quarterly_assessment') NOT NULL,
  `title` varchar(255) NOT NULL,
  `maxScore` decimal(6,2) NOT NULL,
  `dateGiven` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `componentId` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `assessments`
--

INSERT INTO `assessments` (`id`, `classSubjectId`, `quarter`, `type`, `title`, `maxScore`, `dateGiven`, `created_at`, `componentId`) VALUES
(171, 153, 1, 'written_work', 'Quiz 1: Fractions', 20.00, '2026-08-15', '2026-08-22 04:37:54', NULL),
(172, 153, 1, 'written_work', 'Quiz 2: Decimals', 20.00, '2026-09-05', '2026-08-22 04:37:54', NULL),
(173, 153, 1, 'performance_task', 'Problem Set', 30.00, '2026-09-20', '2026-08-22 04:37:54', NULL),
(174, 153, 1, 'performance_task', 'Math Project', 30.00, '2026-10-05', '2026-08-22 04:37:54', NULL),
(175, 153, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-18', '2026-08-22 04:37:54', NULL),
(176, 154, 1, 'written_work', 'Quiz 1: Grammar', 20.00, '2026-08-18', '2026-08-22 04:37:54', NULL),
(177, 154, 1, 'written_work', 'Persuasive Essay', 30.00, '2026-09-12', '2026-08-22 04:37:54', NULL),
(178, 154, 1, 'performance_task', 'Speech Delivery', 30.00, '2026-10-02', '2026-08-22 04:37:54', NULL),
(179, 154, 1, 'performance_task', 'Reading Portfolio', 30.00, '2026-10-12', '2026-08-22 04:37:54', NULL),
(180, 154, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-20', '2026-08-22 04:37:54', NULL),
(181, 155, 1, 'written_work', 'Quiz 1: Matter', 20.00, '2026-08-20', '2026-08-22 04:37:54', NULL),
(182, 155, 1, 'performance_task', 'Lab Report', 30.00, '2026-09-25', '2026-08-22 04:37:54', NULL),
(183, 155, 1, 'performance_task', 'Experiment Demo', 30.00, '2026-10-08', '2026-08-22 04:37:54', NULL),
(184, 155, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-22', '2026-08-22 04:37:54', NULL),
(185, 158, 1, 'written_work', 'Quiz 1: Integers', 20.00, '2026-08-14', '2026-08-22 04:37:54', NULL),
(186, 158, 1, 'written_work', 'Quiz 2: Equations', 20.00, '2026-09-04', '2026-08-22 04:37:54', NULL),
(187, 158, 1, 'performance_task', 'Problem Set', 30.00, '2026-09-19', '2026-08-22 04:37:54', NULL),
(188, 158, 1, 'performance_task', 'Math Project', 30.00, '2026-10-06', '2026-08-22 04:37:54', NULL),
(189, 158, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-17', '2026-08-22 04:37:54', NULL),
(190, 159, 1, 'written_work', 'Quiz 1: Grammar', 20.00, '2026-08-17', '2026-08-22 04:37:54', NULL),
(191, 159, 1, 'performance_task', 'Persuasive Essay', 30.00, '2026-09-11', '2026-08-22 04:37:54', NULL),
(192, 159, 1, 'performance_task', 'Speech Delivery', 30.00, '2026-10-01', '2026-08-22 04:37:54', NULL),
(193, 159, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-19', '2026-08-22 04:37:54', NULL),
(194, 153, 2, 'written_work', 'Quiz 1: Algebra Basics', 20.00, '2026-11-15', '2026-08-22 04:37:54', NULL),
(195, 153, 2, 'performance_task', 'Group Problem Solving', 30.00, '2026-12-05', '2026-08-22 04:37:54', NULL),
(196, 161, 1, 'written_work', 'Quiz 1: Multiple Choice', 20.00, '2026-08-22', '2026-08-22 04:49:10', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `classrooms`
--

CREATE TABLE `classrooms` (
  `id` int(11) NOT NULL,
  `section` varchar(20) NOT NULL,
  `gradeLevel` tinyint(4) NOT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `classrooms`
--

INSERT INTO `classrooms` (`id`, `section`, `gradeLevel`, `status`) VALUES
(102, 'Section A - G7', 7, 'active'),
(103, 'Section B - G7', 7, 'active'),
(104, 'Section C - G8', 8, 'active'),
(105, 'Section D - G8', 8, 'active'),
(106, 'Section E - G9', 9, 'active'),
(107, 'Section F - G9', 9, 'active'),
(108, 'Section G - G10', 10, 'active'),
(109, 'Section H - G10', 10, 'active'),
(110, 'Section I - G11', 11, 'active'),
(111, 'Section J - G11', 11, 'active');

-- --------------------------------------------------------

--
-- Table structure for table `class_daily_attendance`
--

CREATE TABLE `class_daily_attendance` (
  `id` bigint(20) NOT NULL,
  `classId` int(11) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `status` enum('present','absent') DEFAULT NULL,
  `quarter` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `class_daily_attendance`
--

INSERT INTO `class_daily_attendance` (`id`, `classId`, `enrollmentId`, `date`, `status`, `quarter`, `created_at`) VALUES
(1, 102, 104, '2026-08-23', 'present', 1, '2026-08-23 03:42:13'),
(2, 102, 109, '2026-08-23', 'present', 1, '2026-08-23 03:42:13');

-- --------------------------------------------------------

--
-- Table structure for table `class_students`
--

CREATE TABLE `class_students` (
  `id` bigint(20) NOT NULL,
  `classId` int(11) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `class_students`
--

INSERT INTO `class_students` (`id`, `classId`, `enrollmentId`) VALUES
(105, 102, 104),
(106, 103, 105),
(107, 104, 106),
(108, 105, 107),
(109, 106, 108),
(110, 102, 109),
(111, 103, 110),
(112, 104, 111),
(113, 105, 112),
(114, 106, 113);

-- --------------------------------------------------------

--
-- Table structure for table `class_subjects`
--

CREATE TABLE `class_subjects` (
  `id` bigint(20) NOT NULL,
  `classId` int(11) NOT NULL,
  `teacherId` bigint(20) NOT NULL,
  `subjectId` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `class_subjects`
--

INSERT INTO `class_subjects` (`id`, `classId`, `teacherId`, `subjectId`) VALUES
(153, 102, 103, 121),
(154, 102, 104, 122),
(155, 102, 106, 123),
(156, 102, 107, 124),
(157, 102, 108, 125),
(158, 103, 104, 121),
(159, 103, 105, 122),
(160, 103, 109, 126),
(161, 103, 110, 127),
(162, 103, 111, 128),
(165, 104, 103, 131),
(164, 104, 106, 130),
(163, 104, 112, 129),
(166, 105, 105, 132),
(167, 106, 103, 129);

-- --------------------------------------------------------

--
-- Table structure for table `class_teacher`
--

CREATE TABLE `class_teacher` (
  `id` bigint(20) NOT NULL,
  `classId` int(11) NOT NULL,
  `teacherId` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `class_teacher`
--

INSERT INTO `class_teacher` (`id`, `classId`, `teacherId`) VALUES
(107, 102, 103),
(108, 103, 104),
(109, 104, 105),
(110, 105, 106),
(111, 106, 107),
(112, 107, 108),
(113, 108, 109),
(114, 109, 110),
(115, 110, 111),
(116, 111, 112);

-- --------------------------------------------------------

--
-- Table structure for table `enrollments`
--

CREATE TABLE `enrollments` (
  `id` bigint(20) NOT NULL,
  `dateEnrolled` date NOT NULL DEFAULT curdate(),
  `classId` int(11) NOT NULL,
  `schoolYearId` int(11) NOT NULL,
  `studentId` bigint(20) NOT NULL,
  `status` enum('enrolled','unenrolled','dropped','completed') NOT NULL DEFAULT 'enrolled'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `enrollments`
--

INSERT INTO `enrollments` (`id`, `dateEnrolled`, `classId`, `schoolYearId`, `studentId`, `status`) VALUES
(104, '2026-08-22', 102, 116, 123, 'enrolled'),
(105, '2026-08-22', 103, 116, 124, 'enrolled'),
(106, '2026-08-22', 104, 116, 125, 'enrolled'),
(107, '2026-08-22', 105, 116, 126, 'enrolled'),
(108, '2026-08-22', 106, 116, 127, 'enrolled'),
(109, '2026-08-22', 102, 116, 128, 'enrolled'),
(110, '2026-08-22', 103, 116, 129, 'enrolled'),
(111, '2026-08-22', 104, 116, 130, 'enrolled'),
(112, '2026-08-22', 105, 116, 131, 'enrolled'),
(113, '2026-08-22', 106, 116, 132, 'enrolled');

-- --------------------------------------------------------

--
-- Table structure for table `enrollment_details`
--

CREATE TABLE `enrollment_details` (
  `id` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `subjectId` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `enrollment_details`
--

INSERT INTO `enrollment_details` (`id`, `enrollmentId`, `subjectId`) VALUES
(232, 104, 121),
(233, 104, 122),
(234, 105, 121),
(235, 105, 122),
(236, 106, 123),
(237, 106, 124),
(238, 107, 125),
(239, 107, 126),
(240, 108, 121),
(241, 108, 122),
(242, 109, 121),
(243, 109, 122),
(244, 110, 121),
(245, 110, 122),
(246, 111, 123),
(247, 111, 124),
(248, 112, 125),
(249, 112, 126),
(250, 113, 121),
(251, 113, 122);

-- --------------------------------------------------------

--
-- Table structure for table `grading_weights`
--

CREATE TABLE `grading_weights` (
  `id` bigint(20) NOT NULL,
  `classSubjectId` bigint(20) NOT NULL,
  `writtenWorkWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `performanceTaskWeight` decimal(5,2) NOT NULL DEFAULT 60.00,
  `quarterlyAssessmentWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `attendanceWeight` decimal(5,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `grading_weights`
--

INSERT INTO `grading_weights` (`id`, `classSubjectId`, `writtenWorkWeight`, `performanceTaskWeight`, `quarterlyAssessmentWeight`, `attendanceWeight`) VALUES
(42, 153, 19.00, 57.00, 19.00, 5.00),
(43, 154, 28.50, 47.50, 19.00, 5.00),
(44, 155, 19.00, 57.00, 19.00, 5.00),
(45, 158, 19.00, 57.00, 19.00, 5.00),
(46, 159, 28.50, 47.50, 19.00, 5.00);

-- --------------------------------------------------------

--
-- Table structure for table `grading_weight_defaults`
--

CREATE TABLE `grading_weight_defaults` (
  `id` int(11) NOT NULL,
  `writtenWorkWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `performanceTaskWeight` decimal(5,2) NOT NULL DEFAULT 60.00,
  `quarterlyAssessmentWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `attendanceWeight` decimal(5,2) NOT NULL DEFAULT 0.00,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `grading_weight_defaults`
--

INSERT INTO `grading_weight_defaults` (`id`, `writtenWorkWeight`, `performanceTaskWeight`, `quarterlyAssessmentWeight`, `attendanceWeight`, `updated_at`) VALUES
(1, 20.00, 50.00, 20.00, 10.00, '2026-08-13 03:24:50');

-- --------------------------------------------------------

--
-- Table structure for table `schoolyear`
--

CREATE TABLE `schoolyear` (
  `id` int(11) NOT NULL,
  `startYear` varchar(20) NOT NULL,
  `endYear` varchar(20) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `schoolyear`
--

INSERT INTO `schoolyear` (`id`, `startYear`, `endYear`, `isActive`) VALUES
(105, '2015', '2016', 0),
(106, '2016', '2017', 0),
(107, '2017', '2018', 0),
(108, '2018', '2019', 0),
(109, '2019', '2020', 0),
(110, '2020', '2021', 0),
(111, '2021', '2022', 0),
(112, '2022', '2023', 0),
(113, '2023', '2024', 0),
(114, '2024', '2025', 0),
(115, '2025', '2026', 0),
(116, '2026', '2027', 1);

-- --------------------------------------------------------

--
-- Table structure for table `school_info`
--

CREATE TABLE `school_info` (
  `id` int(11) NOT NULL,
  `schoolId` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `district` varchar(255) NOT NULL,
  `division` varchar(255) NOT NULL,
  `region` varchar(255) NOT NULL,
  `principal` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `school_info`
--

INSERT INTO `school_info` (`id`, `schoolId`, `name`, `district`, `division`, `region`, `principal`, `address`) VALUES
(1, 502107, 'Abang-Suizo Integrated School', 'District 1', 'School Division Office of Tacurong City', 'Region XII', 'Dennis B. Rubin', 'Purok Abang-Suizo, Buenaflor, Tacurong City');

-- --------------------------------------------------------

--
-- Table structure for table `students`
--

CREATE TABLE `students` (
  `id` bigint(20) NOT NULL,
  `userId` bigint(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `lrn` varchar(255) NOT NULL,
  `firstname` varchar(255) NOT NULL,
  `middlename` varchar(255) NOT NULL,
  `lastname` varchar(255) NOT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `birthdate` date DEFAULT NULL,
  `sex` varchar(10) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `students`
--

INSERT INTO `students` (`id`, `userId`, `email`, `lrn`, `firstname`, `middlename`, `lastname`, `suffix`, `birthdate`, `sex`, `created_at`, `updated_at`, `status`) VALUES
(123, 263, 'alex.garcia@student.edu', '123456789001', 'Alex', 'R.', 'Garcia', NULL, '2008-03-15', 'Male', '2026-08-22 12:37:54', NULL, NULL),
(124, 264, 'beatriz.mercado@student.edu', '123456789002', 'Beatriz', 'S.', 'Mercado', NULL, '2009-07-22', 'Female', '2026-08-22 12:37:54', NULL, NULL),
(125, 265, 'carlo.mendoza@student.edu', '123456789003', 'Carlo', 'T.', 'Mendoza', NULL, '2008-11-02', 'Male', '2026-08-22 12:37:54', NULL, NULL),
(126, 266, 'diana.lorenzo@student.edu', '123456789004', 'Diana', 'L.', 'Lorenzo', NULL, '2009-01-14', 'Female', '2026-08-22 12:37:54', NULL, NULL),
(127, 267, 'eduardo.silva@student.edu', '123456789005', 'Eduardo', 'V.', 'Silva', NULL, '2008-05-30', 'Male', '2026-08-22 12:37:54', NULL, NULL),
(128, 268, 'francesca.cruz@student.edu', '123456789006', 'Francesca', 'M.', 'Cruz', NULL, '2009-09-18', 'Female', '2026-08-22 12:37:54', NULL, NULL),
(129, 269, 'gabriel.torres@student.edu', '123456789007', 'Gabriel', 'N.', 'Torres', 'II', '2008-12-25', 'Male', '2026-08-22 12:37:54', NULL, NULL),
(130, 270, 'hannah.aguilar@student.edu', '123456789008', 'Hannah', 'P.', 'Aguilar', NULL, '2009-04-08', 'Female', '2026-08-22 12:37:54', NULL, NULL),
(131, 271, 'ivan.delossantos@student.edu', '123456789009', 'Ivan', 'Q.', 'Delos Santos', NULL, '2008-08-19', 'Male', '2026-08-22 12:37:54', NULL, NULL),
(132, 272, 'jasmine.romero@student.edu', '123456789010', 'Jasmine', 'R.', 'Romero', NULL, '2009-06-05', 'Female', '2026-08-22 12:37:54', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `student_academic_records`
--

CREATE TABLE `student_academic_records` (
  `id` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `classSection` varchar(50) NOT NULL,
  `classGradeLevel` int(10) NOT NULL,
  `adviserName` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `student_academic_records`
--

INSERT INTO `student_academic_records` (`id`, `enrollmentId`, `classSection`, `classGradeLevel`, `adviserName`) VALUES
(47, 104, 'Section A - G7', 7, 'Juan M. Dela Cruz'),
(48, 105, 'Section B - G7', 7, 'Maria L. Santos'),
(49, 106, 'Section C - G8', 8, 'Carlos R. Reyes Jr.'),
(50, 107, 'Section D - G8', 8, 'Ana P. Gonzales'),
(51, 108, 'Section E - G9', 9, 'Pedro S. Ramos'),
(52, 109, 'Section A - G7', 7, 'Juan M. Dela Cruz'),
(53, 110, 'Section B - G7', 7, 'Maria L. Santos'),
(54, 111, 'Section C - G8', 8, 'Carlos R. Reyes Jr.'),
(55, 112, 'Section D - G8', 8, 'Ana P. Gonzales'),
(56, 113, 'Section E - G9', 9, 'Pedro S. Ramos');

-- --------------------------------------------------------

--
-- Table structure for table `student_academic_record_components`
--

CREATE TABLE `student_academic_record_components` (
  `id` bigint(20) NOT NULL,
  `subjectRowId` bigint(20) NOT NULL,
  `componentId` bigint(20) NOT NULL,
  `componentName` varchar(50) NOT NULL,
  `componentCode` varchar(20) NOT NULL,
  `q1` decimal(10,2) DEFAULT NULL,
  `q2` decimal(10,2) DEFAULT NULL,
  `q3` decimal(10,2) DEFAULT NULL,
  `q4` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `student_academic_record_quarters`
--

CREATE TABLE `student_academic_record_quarters` (
  `id` bigint(20) NOT NULL,
  `recordId` bigint(20) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `status` enum('pending','submitted') NOT NULL DEFAULT 'pending',
  `submittedAt` datetime DEFAULT NULL,
  `submittedBy` bigint(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `student_academic_record_quarters`
--

INSERT INTO `student_academic_record_quarters` (`id`, `recordId`, `quarter`, `status`, `submittedAt`, `submittedBy`, `created_at`) VALUES
(14, 47, 1, 'submitted', '2026-08-22 12:37:54', 103, '2026-08-22 04:37:54'),
(15, 48, 1, 'submitted', '2026-08-22 12:37:54', 104, '2026-08-22 04:37:54'),
(16, 53, 1, 'submitted', '2026-08-22 12:37:54', 104, '2026-08-22 04:37:54');

-- --------------------------------------------------------

--
-- Table structure for table `student_academic_record_subjects`
--

CREATE TABLE `student_academic_record_subjects` (
  `id` bigint(20) NOT NULL,
  `recordId` bigint(20) NOT NULL,
  `subjectName` varchar(50) NOT NULL,
  `subjectCode` varchar(50) NOT NULL,
  `q1` decimal(5,2) DEFAULT NULL,
  `q2` decimal(5,2) DEFAULT NULL,
  `q3` decimal(5,2) DEFAULT NULL,
  `q4` decimal(5,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `student_academic_record_subjects`
--

INSERT INTO `student_academic_record_subjects` (`id`, `recordId`, `subjectName`, `subjectCode`, `q1`, `q2`, `q3`, `q4`) VALUES
(40, 47, 'Mathematics', 'MATH101', 92.31, NULL, NULL, NULL),
(41, 47, 'English', 'ENG101', 90.72, NULL, NULL, NULL),
(42, 48, 'Mathematics', 'MATH101', 87.70, NULL, NULL, NULL),
(43, 48, 'English', 'ENG101', 83.30, NULL, NULL, NULL),
(44, 53, 'Mathematics', 'MATH101', 83.90, NULL, NULL, NULL),
(45, 53, 'English', 'ENG101', 79.33, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `student_attendance`
--

CREATE TABLE `student_attendance` (
  `id` bigint(20) NOT NULL,
  `classSubjectId` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `status` enum('present','absent') DEFAULT NULL,
  `quarter` tinyint(4) NOT NULL DEFAULT 1,
  `date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `student_attendance`
--

INSERT INTO `student_attendance` (`id`, `classSubjectId`, `enrollmentId`, `status`, `quarter`, `date`, `created_at`) VALUES
(380, 153, 104, 'present', 1, '2026-08-15', '2026-08-22 04:37:54'),
(381, 153, 109, 'present', 1, '2026-08-15', '2026-08-22 04:37:54'),
(382, 153, 104, 'present', 1, '2026-08-16', '2026-08-22 04:37:54'),
(383, 153, 109, 'absent', 1, '2026-08-16', '2026-08-22 04:37:54'),
(384, 153, 104, 'present', 1, '2026-08-17', '2026-08-22 04:37:54'),
(385, 153, 109, 'present', 1, '2026-08-17', '2026-08-22 04:37:54'),
(386, 153, 104, 'present', 1, '2026-08-18', '2026-08-22 04:37:54'),
(387, 153, 109, 'present', 1, '2026-08-18', '2026-08-22 04:37:54'),
(388, 153, 104, 'present', 1, '2026-08-19', '2026-08-22 04:37:54'),
(389, 153, 109, 'absent', 1, '2026-08-19', '2026-08-22 04:37:54'),
(390, 153, 104, 'present', 1, '2026-08-20', '2026-08-22 04:37:54'),
(391, 153, 109, 'present', 1, '2026-08-20', '2026-08-22 04:37:54'),
(392, 153, 104, 'present', 1, '2026-08-21', '2026-08-22 04:37:54'),
(393, 153, 109, 'present', 1, '2026-08-21', '2026-08-22 04:37:54'),
(394, 153, 104, 'present', 1, '2026-08-22', '2026-08-22 04:37:54'),
(395, 153, 109, 'present', 1, '2026-08-22', '2026-08-22 04:37:54'),
(396, 154, 104, 'present', 1, '2026-08-15', '2026-08-22 04:37:54'),
(397, 154, 109, 'present', 1, '2026-08-15', '2026-08-22 04:37:54'),
(398, 154, 104, 'present', 1, '2026-08-16', '2026-08-22 04:37:54'),
(399, 154, 109, 'present', 1, '2026-08-16', '2026-08-22 04:37:54'),
(400, 154, 104, 'present', 1, '2026-08-17', '2026-08-22 04:37:54'),
(401, 154, 109, 'present', 1, '2026-08-17', '2026-08-22 04:37:54'),
(402, 154, 104, 'present', 1, '2026-08-18', '2026-08-22 04:37:54'),
(403, 154, 109, 'absent', 1, '2026-08-18', '2026-08-22 04:37:54'),
(404, 154, 104, 'present', 1, '2026-08-19', '2026-08-22 04:37:54'),
(405, 154, 109, 'present', 1, '2026-08-19', '2026-08-22 04:37:54'),
(406, 154, 104, 'present', 1, '2026-08-20', '2026-08-22 04:37:54'),
(407, 154, 109, 'present', 1, '2026-08-20', '2026-08-22 04:37:54'),
(408, 154, 104, 'present', 1, '2026-08-21', '2026-08-22 04:37:54'),
(409, 154, 109, 'present', 1, '2026-08-21', '2026-08-22 04:37:54'),
(410, 154, 104, 'present', 1, '2026-08-22', '2026-08-22 04:37:54'),
(411, 154, 109, 'present', 1, '2026-08-22', '2026-08-22 04:37:54'),
(412, 155, 104, 'present', 1, '2026-08-15', '2026-08-22 04:37:54'),
(413, 155, 109, 'present', 1, '2026-08-15', '2026-08-22 04:37:54'),
(414, 155, 104, 'present', 1, '2026-08-16', '2026-08-22 04:37:54'),
(415, 155, 109, 'present', 1, '2026-08-16', '2026-08-22 04:37:54'),
(416, 155, 104, 'absent', 1, '2026-08-17', '2026-08-22 04:37:54'),
(417, 155, 109, 'present', 1, '2026-08-17', '2026-08-22 04:37:54'),
(418, 155, 104, 'present', 1, '2026-08-18', '2026-08-22 04:37:54'),
(419, 155, 109, 'present', 1, '2026-08-18', '2026-08-22 04:37:54'),
(420, 155, 104, 'present', 1, '2026-08-19', '2026-08-22 04:37:54'),
(421, 155, 109, 'present', 1, '2026-08-19', '2026-08-22 04:37:54'),
(422, 155, 104, 'present', 1, '2026-08-20', '2026-08-22 04:37:54'),
(423, 155, 109, 'present', 1, '2026-08-20', '2026-08-22 04:37:54'),
(424, 155, 104, 'present', 1, '2026-08-21', '2026-08-22 04:37:54'),
(425, 155, 109, 'present', 1, '2026-08-21', '2026-08-22 04:37:54'),
(426, 155, 104, 'present', 1, '2026-08-22', '2026-08-22 04:37:54'),
(427, 155, 109, 'present', 1, '2026-08-22', '2026-08-22 04:37:54'),
(428, 153, 104, 'present', 1, '2026-08-23', '2026-08-23 03:42:13'),
(429, 153, 109, 'present', 1, '2026-08-23', '2026-08-23 03:42:13');

-- --------------------------------------------------------

--
-- Table structure for table `student_details`
--

CREATE TABLE `student_details` (
  `id` bigint(20) NOT NULL,
  `studentId` bigint(20) NOT NULL,
  `birthplace` varchar(255) DEFAULT NULL,
  `permanentAddress` varchar(255) DEFAULT NULL,
  `religion` varchar(100) DEFAULT NULL,
  `contactNumber` varchar(30) DEFAULT NULL,
  `guardianName` varchar(255) DEFAULT NULL,
  `guardianRelation` varchar(50) DEFAULT NULL,
  `guardianContact` varchar(30) DEFAULT NULL,
  `guardianOccupation` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `student_scores`
--

CREATE TABLE `student_scores` (
  `id` bigint(20) NOT NULL,
  `assessmentId` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `score` decimal(6,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `student_scores`
--

INSERT INTO `student_scores` (`id`, `assessmentId`, `enrollmentId`, `score`, `created_at`, `updated_at`) VALUES
(407, 172, 104, 19.00, '2026-08-22 04:37:54', NULL),
(408, 172, 109, 14.00, '2026-08-22 04:37:54', NULL),
(409, 173, 104, 27.00, '2026-08-22 04:37:54', NULL),
(410, 173, 109, 24.00, '2026-08-22 04:37:54', NULL),
(411, 174, 104, 28.00, '2026-08-22 04:37:54', NULL),
(412, 174, 109, 22.00, '2026-08-22 04:37:54', NULL),
(413, 175, 104, 46.00, '2026-08-22 04:37:54', NULL),
(414, 175, 109, 40.00, '2026-08-22 04:37:54', NULL),
(415, 176, 104, 18.00, '2026-08-22 04:37:54', NULL),
(416, 176, 109, 14.00, '2026-08-22 04:37:54', NULL),
(417, 177, 104, 26.00, '2026-08-22 04:37:54', NULL),
(418, 177, 109, 22.00, '2026-08-22 04:37:54', NULL),
(419, 178, 104, 27.00, '2026-08-22 04:37:54', NULL),
(420, 178, 109, 20.00, '2026-08-22 04:37:54', NULL),
(421, 179, 104, 28.00, '2026-08-22 04:37:54', NULL),
(422, 179, 109, 24.00, '2026-08-22 04:37:54', NULL),
(423, 180, 104, 45.00, '2026-08-22 04:37:54', NULL),
(424, 180, 109, 42.00, '2026-08-22 04:37:54', NULL),
(425, 181, 104, 17.00, '2026-08-22 04:37:54', NULL),
(426, 181, 109, 12.00, '2026-08-22 04:37:54', NULL),
(427, 182, 104, 27.00, '2026-08-22 04:37:54', NULL),
(428, 182, 109, 20.00, '2026-08-22 04:37:54', NULL),
(429, 183, 104, 28.00, '2026-08-22 04:37:54', NULL),
(430, 183, 109, 22.00, '2026-08-22 04:37:54', NULL),
(431, 184, 104, 44.00, '2026-08-22 04:37:54', NULL),
(432, 184, 109, 33.00, '2026-08-22 04:37:54', NULL),
(433, 185, 105, 17.00, '2026-08-22 04:37:54', NULL),
(434, 185, 110, 16.00, '2026-08-22 04:37:54', NULL),
(435, 186, 105, 18.00, '2026-08-22 04:37:54', NULL),
(436, 186, 110, 17.00, '2026-08-22 04:37:54', NULL),
(437, 187, 105, 26.00, '2026-08-22 04:37:54', NULL),
(438, 187, 110, 25.00, '2026-08-22 04:37:54', NULL),
(439, 188, 105, 27.00, '2026-08-22 04:37:54', NULL),
(440, 188, 110, 26.00, '2026-08-22 04:37:54', NULL),
(441, 189, 105, 43.00, '2026-08-22 04:37:54', NULL),
(442, 189, 110, 41.00, '2026-08-22 04:37:54', NULL),
(443, 190, 105, 16.00, '2026-08-22 04:37:54', NULL),
(444, 190, 110, 15.00, '2026-08-22 04:37:54', NULL),
(445, 191, 105, 25.00, '2026-08-22 04:37:54', NULL),
(446, 191, 110, 24.00, '2026-08-22 04:37:54', NULL),
(447, 192, 105, 26.00, '2026-08-22 04:37:54', NULL),
(448, 192, 110, 25.00, '2026-08-22 04:37:54', NULL),
(449, 193, 105, 42.00, '2026-08-22 04:37:54', NULL),
(450, 193, 110, 40.00, '2026-08-22 04:37:54', NULL),
(451, 194, 104, 17.00, '2026-08-22 04:37:54', NULL),
(452, 194, 109, 12.00, '2026-08-22 04:37:54', NULL),
(453, 195, 104, 27.00, '2026-08-22 04:37:54', NULL),
(454, 195, 109, 21.00, '2026-08-22 04:37:54', NULL),
(455, 196, 105, 20.00, '2026-08-22 04:50:20', NULL),
(456, 196, 110, 20.00, '2026-08-22 04:50:20', NULL),
(457, 171, 104, 15.00, '2026-08-23 06:16:40', NULL),
(458, 171, 109, 15.00, '2026-08-23 06:16:40', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `subjects`
--

CREATE TABLE `subjects` (
  `id` int(11) NOT NULL,
  `name` varchar(20) NOT NULL,
  `code` text NOT NULL,
  `unit` decimal(10,0) DEFAULT NULL,
  `hasComponents` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subjects`
--

INSERT INTO `subjects` (`id`, `name`, `code`, `unit`, `hasComponents`) VALUES
(121, 'Mathematics', 'MATH101', 3, 0),
(122, 'English', 'ENG101', 3, 0),
(123, 'Science', 'SCI101', 3, 0),
(124, 'Filipino', 'FIL101', 3, 0),
(125, 'Araling Panlipunan', 'AP101', 2, 0),
(126, 'Values Education', 'VAL101', 2, 0),
(127, 'MAPEH', 'MAPEH101', 2, 1),
(128, 'Technology and Livel', 'TLE101', 2, 0),
(129, 'Computer Science', 'CS101', 3, 0),
(130, 'Science 2 - Chemistr', 'SCI201', 3, 0),
(131, 'Mathematics 2 - Alge', 'MATH201', 3, 0),
(132, 'English 2 - Literatu', 'ENG201', 3, 0);

-- --------------------------------------------------------

--
-- Table structure for table `subject_components`
--

CREATE TABLE `subject_components` (
  `id` bigint(20) NOT NULL,
  `parentSubjectId` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `code` varchar(20) NOT NULL,
  `weight` decimal(5,2) NOT NULL DEFAULT 25.00,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subject_components`
--

INSERT INTO `subject_components` (`id`, `parentSubjectId`, `name`, `code`, `weight`, `createdAt`) VALUES
(5, 127, 'Music', 'MAPEH-M', 25.00, '2026-08-22 04:37:54'),
(6, 127, 'Arts', 'MAPEH-A', 25.00, '2026-08-22 04:37:54'),
(7, 127, 'Physical Education', 'MAPEH-PE', 25.00, '2026-08-22 04:37:54'),
(8, 127, 'Health', 'MAPEH-H', 25.00, '2026-08-22 04:37:54');

-- --------------------------------------------------------

--
-- Table structure for table `teachers`
--

CREATE TABLE `teachers` (
  `id` bigint(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `firstname` varchar(50) NOT NULL,
  `middlename` varchar(20) NOT NULL,
  `lastname` varchar(50) NOT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `userId` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `teachers`
--

INSERT INTO `teachers` (`id`, `email`, `firstname`, `middlename`, `lastname`, `suffix`, `userId`) VALUES
(103, 'juan.delacruz@gradesync.edu', 'Juan', 'M.', 'Dela Cruz', NULL, 253),
(104, 'maria.santos@gradesync.edu', 'Maria', 'L.', 'Santos', NULL, 254),
(105, 'carlos.reyes@gradesync.edu', 'Carlos', 'R.', 'Reyes', 'Jr.', 255),
(106, 'ana.gonzales@gradesync.edu', 'Ana', 'P.', 'Gonzales', NULL, 256),
(107, 'pedro.ramos@gradesync.edu', 'Pedro', 'S.', 'Ramos', NULL, 257),
(108, 'luz.villanueva@gradesync.edu', 'Luz', 'T.', 'Villanueva', NULL, 258),
(109, 'miguel.angeles@gradesync.edu', 'Miguel', 'D.', 'Angeles', 'III', 259),
(110, 'rosa.lopez@gmail.edu', 'Rosa', 'C.', 'Lopez', NULL, 260),
(111, 'antonio.flores@gradesync.edu', 'Antonio', 'B.', 'Flores', NULL, 261),
(112, 'elena.garcia@gradesync.edu', 'Elena', 'G.', 'Garcia', NULL, 262);

-- --------------------------------------------------------

--
-- Table structure for table `teacher_subject_assignment`
--

CREATE TABLE `teacher_subject_assignment` (
  `id` bigint(20) NOT NULL,
  `teacherId` bigint(20) NOT NULL,
  `subjectId` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `teacher_subject_assignment`
--

INSERT INTO `teacher_subject_assignment` (`id`, `teacherId`, `subjectId`) VALUES
(233, 103, 121),
(234, 104, 121),
(235, 104, 122),
(236, 105, 122),
(237, 106, 123),
(238, 107, 124),
(239, 108, 125),
(240, 109, 126),
(241, 110, 127),
(242, 111, 128),
(243, 112, 129),
(244, 103, 129),
(245, 106, 130),
(246, 103, 131),
(247, 105, 132);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password`, `role`, `status`, `created_at`, `updated_at`) VALUES
(252, 'admin@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'admin', 'active', '2026-08-22 04:37:54', NULL),
(253, 'juan.delacruz@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(254, 'maria.santos@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(255, 'carlos.reyes@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(256, 'ana.gonzales@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(257, 'pedro.ramos@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(258, 'luz.villanueva@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(259, 'miguel.angeles@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(260, 'rosa.lopez@gmail.edu', '$2b$10$xNkdrdaR5Vd/CiFQFz7jnOHv5231ZFTW1x6FAdu7PPYrZoRtj283S', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(261, 'antonio.flores@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(262, 'elena.garcia@gradesync.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'teacher', 'active', '2026-08-22 04:37:54', NULL),
(263, 'alex.garcia@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(264, 'beatriz.mercado@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(265, 'carlo.mendoza@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(266, 'diana.lorenzo@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(267, 'eduardo.silva@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(268, 'francesca.cruz@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(269, 'gabriel.torres@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(270, 'hannah.aguilar@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(271, 'ivan.delossantos@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL),
(272, 'jasmine.romero@student.edu', '$2b$10$7rmnN9qEH0h6cYPjmnBZsuS.dqLZGtN0O8epY6U95Ui7Crr6meNgC', 'student', 'active', '2026-08-22 04:37:54', NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `academic_settings`
--
ALTER TABLE `academic_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `assessments`
--
ALTER TABLE `assessments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_assessments_classSubject` (`classSubjectId`),
  ADD KEY `fk_assessments_component` (`componentId`);

--
-- Indexes for table `classrooms`
--
ALTER TABLE `classrooms`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_classroom_section` (`section`,`gradeLevel`);

--
-- Indexes for table `class_daily_attendance`
--
ALTER TABLE `class_daily_attendance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_class_attendance_once` (`classId`,`enrollmentId`,`date`),
  ADD KEY `fk_class_attendance_enrollment` (`enrollmentId`),
  ADD KEY `fk_class_attendance_class` (`classId`),
  ADD KEY `idx_class_attendance_quarter` (`quarter`);

--
-- Indexes for table `class_students`
--
ALTER TABLE `class_students`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_class_student1` (`classId`),
  ADD KEY `fk_class_student2` (`enrollmentId`);

--
-- Indexes for table `class_subjects`
--
ALTER TABLE `class_subjects`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_class_subjects` (`classId`,`teacherId`,`subjectId`),
  ADD KEY `FK_teacherId` (`teacherId`),
  ADD KEY `fk_subjectId` (`subjectId`);

--
-- Indexes for table `class_teacher`
--
ALTER TABLE `class_teacher`
  ADD PRIMARY KEY (`id`),
  ADD KEY `classId` (`classId`),
  ADD KEY `teacherId` (`teacherId`);

--
-- Indexes for table `enrollments`
--
ALTER TABLE `enrollments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_enrollment_studentId` (`studentId`);

--
-- Indexes for table `enrollment_details`
--
ALTER TABLE `enrollment_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `grading_weights`
--
ALTER TABLE `grading_weights`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_weight_class_subject` (`classSubjectId`);

--
-- Indexes for table `grading_weight_defaults`
--
ALTER TABLE `grading_weight_defaults`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `schoolyear`
--
ALTER TABLE `schoolyear`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `school_info`
--
ALTER TABLE `school_info`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `students`
--
ALTER TABLE `students`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `userId` (`userId`);

--
-- Indexes for table `student_academic_records`
--
ALTER TABLE `student_academic_records`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_enrollmentid` (`enrollmentId`);

--
-- Indexes for table `student_academic_record_components`
--
ALTER TABLE `student_academic_record_components`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_record_component` (`subjectRowId`,`componentId`),
  ADD KEY `fk_component_componentId` (`componentId`);

--
-- Indexes for table `student_academic_record_quarters`
--
ALTER TABLE `student_academic_record_quarters`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_record_quarter` (`recordId`,`quarter`),
  ADD KEY `fk_record_quarter_submittedBy` (`submittedBy`);

--
-- Indexes for table `student_academic_record_subjects`
--
ALTER TABLE `student_academic_record_subjects`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_record_subject_name` (`recordId`,`subjectName`);

--
-- Indexes for table `student_attendance`
--
ALTER TABLE `student_attendance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_attendance_once` (`classSubjectId`,`enrollmentId`,`date`),
  ADD KEY `fk_attendance_enrollment` (`enrollmentId`),
  ADD KEY `fk_attendance_class_subject` (`classSubjectId`),
  ADD KEY `idx_attendance_quarter` (`quarter`);

--
-- Indexes for table `student_details`
--
ALTER TABLE `student_details`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_student_details_student` (`studentId`);

--
-- Indexes for table `student_scores`
--
ALTER TABLE `student_scores`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_score_once` (`assessmentId`,`enrollmentId`),
  ADD KEY `fk_scores_enrollment` (`enrollmentId`);

--
-- Indexes for table `subjects`
--
ALTER TABLE `subjects`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `subject_components`
--
ALTER TABLE `subject_components`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_component_code` (`parentSubjectId`,`code`);

--
-- Indexes for table `teachers`
--
ALTER TABLE `teachers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `fk_teacher1` (`userId`);

--
-- Indexes for table `teacher_subject_assignment`
--
ALTER TABLE `teacher_subject_assignment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_tsa_1` (`teacherId`),
  ADD KEY `fk_tsa_2` (`subjectId`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `academic_settings`
--
ALTER TABLE `academic_settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `assessments`
--
ALTER TABLE `assessments`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=197;

--
-- AUTO_INCREMENT for table `classrooms`
--
ALTER TABLE `classrooms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=112;

--
-- AUTO_INCREMENT for table `class_daily_attendance`
--
ALTER TABLE `class_daily_attendance`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `class_students`
--
ALTER TABLE `class_students`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=115;

--
-- AUTO_INCREMENT for table `class_subjects`
--
ALTER TABLE `class_subjects`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=168;

--
-- AUTO_INCREMENT for table `class_teacher`
--
ALTER TABLE `class_teacher`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=117;

--
-- AUTO_INCREMENT for table `enrollments`
--
ALTER TABLE `enrollments`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=114;

--
-- AUTO_INCREMENT for table `enrollment_details`
--
ALTER TABLE `enrollment_details`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=252;

--
-- AUTO_INCREMENT for table `grading_weights`
--
ALTER TABLE `grading_weights`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;

--
-- AUTO_INCREMENT for table `grading_weight_defaults`
--
ALTER TABLE `grading_weight_defaults`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `schoolyear`
--
ALTER TABLE `schoolyear`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=117;

--
-- AUTO_INCREMENT for table `school_info`
--
ALTER TABLE `school_info`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `students`
--
ALTER TABLE `students`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=133;

--
-- AUTO_INCREMENT for table `student_academic_records`
--
ALTER TABLE `student_academic_records`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=57;

--
-- AUTO_INCREMENT for table `student_academic_record_components`
--
ALTER TABLE `student_academic_record_components`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `student_academic_record_quarters`
--
ALTER TABLE `student_academic_record_quarters`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `student_academic_record_subjects`
--
ALTER TABLE `student_academic_record_subjects`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=46;

--
-- AUTO_INCREMENT for table `student_attendance`
--
ALTER TABLE `student_attendance`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=430;

--
-- AUTO_INCREMENT for table `student_details`
--
ALTER TABLE `student_details`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `student_scores`
--
ALTER TABLE `student_scores`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=459;

--
-- AUTO_INCREMENT for table `subjects`
--
ALTER TABLE `subjects`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=133;

--
-- AUTO_INCREMENT for table `subject_components`
--
ALTER TABLE `subject_components`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `teachers`
--
ALTER TABLE `teachers`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=113;

--
-- AUTO_INCREMENT for table `teacher_subject_assignment`
--
ALTER TABLE `teacher_subject_assignment`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=248;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=273;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `assessments`
--
ALTER TABLE `assessments`
  ADD CONSTRAINT `fk_assessments_classSubject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_assessments_component` FOREIGN KEY (`componentId`) REFERENCES `subject_components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `class_daily_attendance`
--
ALTER TABLE `class_daily_attendance`
  ADD CONSTRAINT `fk_class_attendance_class` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_class_attendance_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `class_students`
--
ALTER TABLE `class_students`
  ADD CONSTRAINT `fk_class_student1` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_class_student2` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `class_subjects`
--
ALTER TABLE `class_subjects`
  ADD CONSTRAINT `FK_teacherId` FOREIGN KEY (`teacherId`) REFERENCES `teachers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_classId` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_subjectId` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `class_teacher`
--
ALTER TABLE `class_teacher`
  ADD CONSTRAINT `class_teacher_ibfk_1` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`),
  ADD CONSTRAINT `class_teacher_ibfk_2` FOREIGN KEY (`teacherId`) REFERENCES `teachers` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_class_teacher2` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_teacherId_1` FOREIGN KEY (`teacherId`) REFERENCES `teachers` (`id`);

--
-- Constraints for table `enrollments`
--
ALTER TABLE `enrollments`
  ADD CONSTRAINT `fk_enrollment_studentId` FOREIGN KEY (`studentId`) REFERENCES `students` (`id`);

--
-- Constraints for table `grading_weights`
--
ALTER TABLE `grading_weights`
  ADD CONSTRAINT `fk_weights_class_subject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `students`
--
ALTER TABLE `students`
  ADD CONSTRAINT `students_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `student_academic_records`
--
ALTER TABLE `student_academic_records`
  ADD CONSTRAINT `fk_enrollmentid` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`);

--
-- Constraints for table `student_academic_record_components`
--
ALTER TABLE `student_academic_record_components`
  ADD CONSTRAINT `fk_component_componentId` FOREIGN KEY (`componentId`) REFERENCES `subject_components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_component_subjectRow` FOREIGN KEY (`subjectRowId`) REFERENCES `student_academic_record_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `student_academic_record_quarters`
--
ALTER TABLE `student_academic_record_quarters`
  ADD CONSTRAINT `fk_record_quarter_record` FOREIGN KEY (`recordId`) REFERENCES `student_academic_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_record_quarter_teacher` FOREIGN KEY (`submittedBy`) REFERENCES `teachers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `student_academic_record_subjects`
--
ALTER TABLE `student_academic_record_subjects`
  ADD CONSTRAINT `fk_recordId` FOREIGN KEY (`recordId`) REFERENCES `student_academic_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `student_attendance`
--
ALTER TABLE `student_attendance`
  ADD CONSTRAINT `fk_attendance_class_subject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_attendance_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `student_details`
--
ALTER TABLE `student_details`
  ADD CONSTRAINT `fk_student_details_student` FOREIGN KEY (`studentId`) REFERENCES `students` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `student_scores`
--
ALTER TABLE `student_scores`
  ADD CONSTRAINT `fk_scores_assessment` FOREIGN KEY (`assessmentId`) REFERENCES `assessments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_scores_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `subject_components`
--
ALTER TABLE `subject_components`
  ADD CONSTRAINT `fk_component_parent` FOREIGN KEY (`parentSubjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `teachers`
--
ALTER TABLE `teachers`
  ADD CONSTRAINT `fk_teacher1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `teacher_subject_assignment`
--
ALTER TABLE `teacher_subject_assignment`
  ADD CONSTRAINT `fk_tsa_1` FOREIGN KEY (`teacherId`) REFERENCES `teachers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_tsa_2` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 14, 2026 at 03:24 AM
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
-- Database: `gradesync_v3`
--

-- --------------------------------------------------------

--
-- Table structure for table `academic_settings`
--

CREATE TABLE `academic_settings` (
  `id` int(11) NOT NULL,
  `currentQuarter` tinyint(1) NOT NULL DEFAULT 1,
  `enrollmentOpen` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Dumping data for table `academic_settings`
--

INSERT INTO `academic_settings` (`id`, `currentQuarter`, `enrollmentOpen`, `updated_at`) VALUES
(1, 1, 1, '2026-08-13 09:33:32');

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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `assessments`
--

INSERT INTO `assessments` (`id`, `classSubjectId`, `quarter`, `type`, `title`, `maxScore`, `dateGiven`, `created_at`) VALUES
(52, 71, 1, 'written_work', 'Quiz 1: Fractions', 20.00, '2026-08-15', '2026-08-12 13:05:55'),
(53, 71, 1, 'written_work', 'Quiz 2: Decimals', 20.00, '2026-09-05', '2026-08-12 13:05:55'),
(54, 71, 1, 'performance_task', 'Problem Set', 30.00, '2026-09-20', '2026-08-12 13:05:55'),
(55, 71, 1, 'performance_task', 'Math Project', 30.00, '2026-10-05', '2026-08-12 13:05:55'),
(56, 71, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-18', '2026-08-12 13:05:55'),
(57, 72, 1, 'written_work', 'Quiz 1: Grammar', 20.00, '2026-08-18', '2026-08-12 13:05:55'),
(58, 72, 1, 'written_work', 'Persuasive Essay', 30.00, '2026-09-12', '2026-08-12 13:05:55'),
(59, 72, 1, 'performance_task', 'Speech Delivery', 30.00, '2026-10-02', '2026-08-12 13:05:55'),
(60, 72, 1, 'performance_task', 'Reading Portfolio', 30.00, '2026-10-12', '2026-08-12 13:05:55'),
(61, 72, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-20', '2026-08-12 13:05:55'),
(62, 73, 1, 'written_work', 'Quiz 1: Matter', 20.00, '2026-08-20', '2026-08-12 13:05:55'),
(63, 73, 1, 'performance_task', 'Lab Report', 30.00, '2026-09-25', '2026-08-12 13:05:55'),
(64, 73, 1, 'performance_task', 'Experiment Demo', 30.00, '2026-10-08', '2026-08-12 13:05:55'),
(65, 73, 1, 'quarterly_assessment', 'Quarter 1 Exam', 50.00, '2026-10-22', '2026-08-12 13:05:55'),
(66, 71, 2, 'written_work', 'Quiz 1: Algebra Basics', 20.00, '2026-11-15', '2026-08-12 13:05:55'),
(67, 71, 2, 'performance_task', 'Group Problem Solving', 30.00, '2026-12-05', '2026-08-12 13:05:55');

-- --------------------------------------------------------

--
-- Table structure for table `classrooms`
--

CREATE TABLE `classrooms` (
  `id` int(11) NOT NULL,
  `section` varchar(20) NOT NULL,
  `gradeLevel` tinyint(4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `classrooms`
--

INSERT INTO `classrooms` (`id`, `section`, `gradeLevel`) VALUES
(51, 'Section A - G7', 7),
(52, 'Section B - G7', 7),
(53, 'Section C - G8', 8),
(54, 'Section D - G8', 8),
(55, 'Section E - G9', 9),
(56, 'Section F - G9', 9),
(57, 'Section G - G10', 10),
(58, 'Section H - G10', 10),
(59, 'Section I - G11', 11),
(60, 'Section J - G11', 11);

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
(47, 51, 46),
(48, 52, 47),
(49, 53, 48),
(50, 54, 49),
(51, 55, 50),
(52, 51, 51),
(53, 52, 52),
(54, 53, 53),
(55, 54, 54),
(56, 55, 55),
(57, 51, 57);

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
(71, 51, 48, 53),
(72, 51, 49, 54),
(73, 51, 51, 55),
(74, 51, 52, 56),
(75, 51, 53, 57),
(86, 51, 54, 58),
(87, 51, 55, 59),
(76, 52, 49, 53),
(77, 52, 50, 54),
(78, 52, 54, 58),
(79, 52, 55, 59),
(80, 52, 56, 60),
(83, 53, 48, 63),
(82, 53, 51, 62),
(81, 53, 57, 61),
(84, 54, 50, 64),
(85, 55, 48, 61);

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
(51, 52, 49),
(52, 53, 50),
(53, 54, 51),
(54, 55, 52),
(55, 56, 53),
(56, 57, 54),
(57, 58, 55),
(58, 59, 56),
(59, 60, 57),
(63, 51, 48);

-- --------------------------------------------------------

--
-- Table structure for table `enrollments`
--

CREATE TABLE `enrollments` (
  `id` bigint(20) NOT NULL,
  `dateEnrolled` date NOT NULL DEFAULT curdate(),
  `classId` int(11) NOT NULL,
  `schoolYearId` int(11) NOT NULL,
  `studentId` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `enrollments`
--

INSERT INTO `enrollments` (`id`, `dateEnrolled`, `classId`, `schoolYearId`, `studentId`) VALUES
(46, '2026-08-12', 51, 45, 67),
(47, '2026-08-12', 52, 45, 68),
(48, '2026-08-12', 53, 45, 69),
(49, '2026-08-12', 54, 45, 70),
(50, '2026-08-12', 55, 45, 71),
(51, '2026-08-12', 51, 45, 72),
(52, '2026-08-12', 52, 45, 73),
(53, '2026-08-12', 53, 45, 74),
(54, '2026-08-12', 54, 45, 75),
(55, '2026-08-12', 55, 45, 76),
(57, '2026-08-13', 51, 55, 77);

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
(92, 46, 53),
(93, 46, 54),
(94, 47, 53),
(95, 47, 54),
(96, 48, 55),
(97, 48, 56),
(98, 49, 57),
(99, 49, 58),
(100, 50, 53),
(101, 50, 54),
(102, 51, 53),
(103, 51, 54),
(104, 52, 53),
(105, 52, 54),
(106, 53, 55),
(107, 53, 56),
(108, 54, 57),
(109, 54, 58),
(110, 55, 53),
(111, 55, 54),
(112, 57, 53),
(113, 57, 54),
(114, 57, 55),
(115, 57, 56),
(116, 57, 57);

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
) ;

--
-- Dumping data for table `grading_weights`
--

INSERT INTO `grading_weights` (`id`, `classSubjectId`, `writtenWorkWeight`, `performanceTaskWeight`, `quarterlyAssessmentWeight`, `attendanceWeight`) VALUES
(15, 71, 19.00, 57.00, 19.00, 5.00),
(16, 72, 28.50, 47.50, 19.00, 5.00),
(17, 73, 19.00, 57.00, 19.00, 5.00);

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
) ;

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
(45, '2015', '2016', 0),
(46, '2016', '2017', 0),
(47, '2017', '2018', 0),
(48, '2018', '2019', 0),
(49, '2019', '2020', 0),
(50, '2020', '2021', 0),
(51, '2021', '2022', 0),
(52, '2022', '2023', 0),
(53, '2023', '2024', 0),
(54, '2024', '2025', 0),
(55, '2026', '2027', 1);

-- --------------------------------------------------------

--
-- Table structure for table `school_info`
--

CREATE TABLE `school_info` (
  `id` int(11) NOT NULL,
  `schoolId` bigint(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `district` varchar(20) NOT NULL,
  `division` varchar(50) NOT NULL,
  `region` varchar(20) NOT NULL,
  `principal` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `school_info`
--

INSERT INTO `school_info` (`id`, `schoolId`, `name`, `district`, `division`, `region`, `principal`, `address`, `created_at`, `updated_at`) VALUES
(5, 12345, 'Abang zuiso integrated school', 'District I', 'City Schools Division', 'National Capital Reg', 'Erwin B. Layson', 'Tacurong Sultan Kudarat', '2026-08-12 13:05:55', '2026-08-13 09:47:04');

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
  `status` enum('active','inactive','enrolled','graduated') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `students`
--

INSERT INTO `students` (`id`, `userId`, `email`, `lrn`, `firstname`, `middlename`, `lastname`, `suffix`, `birthdate`, `sex`, `created_at`, `updated_at`, `status`) VALUES
(67, 147, 'alex.updated@student.edu', '123456789001', 'Alexandra', 'R.', 'Garcia', NULL, '2008-03-15', 'Male', '2026-08-12 21:05:55', NULL, NULL),
(68, 148, 'beatriz.mercado@student.edu', '123456789002', 'Beatriz', 'S.', 'Mercado', NULL, '2009-07-22', 'Female', '2026-08-12 21:05:55', NULL, 'inactive'),
(69, 149, 'carlo.mendoza@student.edu', '123456789003', 'Carlo', 'T.', 'Mendoza', NULL, '2008-11-02', 'Male', '2026-08-12 21:05:55', NULL, NULL),
(70, 150, 'diana.lorenzo@student.edu', '123456789004', 'Diana', 'L.', 'Lorenzo', NULL, '2009-01-14', 'Female', '2026-08-12 21:05:55', NULL, NULL),
(71, 151, 'eduardo.silva@student.edu', '123456789005', 'Eduardo', 'V.', 'Silva', NULL, '2008-05-30', 'Male', '2026-08-12 21:05:55', NULL, NULL),
(72, 152, 'francesca.cruz@student.edu', '123456789006', 'Francesca', 'M.', 'Cruz', NULL, '2009-09-18', 'Female', '2026-08-12 21:05:55', NULL, NULL),
(73, 153, 'gabriel.torres@student.edu', '123456789007', 'Gabriel', 'N.', 'Torres', 'II', '2008-12-25', 'Male', '2026-08-12 21:05:55', NULL, NULL),
(74, 154, 'hannah.aguilar@student.edu', '123456789008', 'Hannah', 'P.', 'Aguilar', NULL, '2009-04-08', 'Female', '2026-08-12 21:05:55', NULL, NULL),
(75, 155, 'ivan.delossantos@student.edu', '123456789009', 'Ivan', 'Q.', 'Delos Santos', NULL, '2008-08-19', 'Male', '2026-08-12 21:05:55', NULL, NULL),
(76, 156, 'jasmine.romero@student.edu', '123456789010', 'Jasmine', 'R.', 'Romero', NULL, '2009-06-05', 'Female', '2026-08-12 21:05:55', NULL, NULL),
(77, 157, 'erwinlaysone97@gmail.com', '123009823', 'Erwi', 'B. ', 'Layson', NULL, '2003-05-23', 'Male', '2026-08-12 21:15:22', NULL, 'enrolled');

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

-- --------------------------------------------------------

--
-- Table structure for table `student_academic_record_subjects`
--

CREATE TABLE `student_academic_record_subjects` (
  `id` bigint(20) NOT NULL,
  `recordId` bigint(20) NOT NULL,
  `q1` decimal(10,0) NOT NULL,
  `q2` decimal(10,0) NOT NULL,
  `q3` decimal(10,0) NOT NULL,
  `q4` decimal(10,0) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(129, 71, 46, 'present', 1, '2026-08-05', '2026-08-12 13:05:55'),
(130, 71, 51, 'present', 1, '2026-08-05', '2026-08-12 13:05:55'),
(131, 71, 46, 'present', 1, '2026-08-06', '2026-08-12 13:05:55'),
(132, 71, 51, 'absent', 1, '2026-08-06', '2026-08-12 13:05:55'),
(133, 71, 46, 'present', 1, '2026-08-07', '2026-08-12 13:05:55'),
(134, 71, 51, 'present', 1, '2026-08-07', '2026-08-12 13:05:55'),
(135, 71, 46, 'present', 1, '2026-08-08', '2026-08-12 13:05:55'),
(136, 71, 51, 'present', 1, '2026-08-08', '2026-08-12 13:05:55'),
(137, 71, 46, 'present', 1, '2026-08-09', '2026-08-12 13:05:55'),
(138, 71, 51, 'absent', 1, '2026-08-09', '2026-08-12 13:05:55'),
(139, 71, 46, 'present', 1, '2026-08-10', '2026-08-12 13:05:55'),
(140, 71, 51, 'present', 1, '2026-08-10', '2026-08-12 13:05:55'),
(141, 71, 46, 'present', 1, '2026-08-11', '2026-08-12 13:05:55'),
(142, 71, 51, 'present', 1, '2026-08-11', '2026-08-12 13:05:55'),
(143, 71, 46, 'present', 1, '2026-08-12', '2026-08-12 13:05:55'),
(144, 71, 51, 'present', 1, '2026-08-12', '2026-08-12 13:05:55'),
(145, 72, 46, 'present', 1, '2026-08-05', '2026-08-12 13:05:55'),
(146, 72, 51, 'present', 1, '2026-08-05', '2026-08-12 13:05:55'),
(147, 72, 46, 'present', 1, '2026-08-06', '2026-08-12 13:05:55'),
(148, 72, 51, 'present', 1, '2026-08-06', '2026-08-12 13:05:55'),
(149, 72, 46, 'present', 1, '2026-08-07', '2026-08-12 13:05:55'),
(150, 72, 51, 'present', 1, '2026-08-07', '2026-08-12 13:05:55'),
(151, 72, 46, 'present', 1, '2026-08-08', '2026-08-12 13:05:55'),
(152, 72, 51, 'absent', 1, '2026-08-08', '2026-08-12 13:05:55'),
(153, 72, 46, 'present', 1, '2026-08-09', '2026-08-12 13:05:55'),
(154, 72, 51, 'present', 1, '2026-08-09', '2026-08-12 13:05:55'),
(155, 72, 46, 'present', 1, '2026-08-10', '2026-08-12 13:05:55'),
(156, 72, 51, 'present', 1, '2026-08-10', '2026-08-12 13:05:55'),
(157, 72, 46, 'present', 1, '2026-08-11', '2026-08-12 13:05:55'),
(158, 72, 51, 'present', 1, '2026-08-11', '2026-08-12 13:05:55'),
(159, 72, 46, 'present', 1, '2026-08-12', '2026-08-12 13:05:55'),
(160, 72, 51, 'present', 1, '2026-08-12', '2026-08-12 13:05:55'),
(161, 73, 46, 'present', 1, '2026-08-05', '2026-08-12 13:05:55'),
(162, 73, 51, 'present', 1, '2026-08-05', '2026-08-12 13:05:55'),
(163, 73, 46, 'present', 1, '2026-08-06', '2026-08-12 13:05:55'),
(164, 73, 51, 'present', 1, '2026-08-06', '2026-08-12 13:05:55'),
(165, 73, 46, 'absent', 1, '2026-08-07', '2026-08-12 13:05:55'),
(166, 73, 51, 'present', 1, '2026-08-07', '2026-08-12 13:05:55'),
(167, 73, 46, 'present', 1, '2026-08-08', '2026-08-12 13:05:55'),
(168, 73, 51, 'present', 1, '2026-08-08', '2026-08-12 13:05:55'),
(169, 73, 46, 'present', 1, '2026-08-09', '2026-08-12 13:05:55'),
(170, 73, 51, 'present', 1, '2026-08-09', '2026-08-12 13:05:55'),
(171, 73, 46, 'present', 1, '2026-08-10', '2026-08-12 13:05:55'),
(172, 73, 51, 'present', 1, '2026-08-10', '2026-08-12 13:05:55'),
(173, 73, 46, 'present', 1, '2026-08-11', '2026-08-12 13:05:55'),
(174, 73, 51, 'present', 1, '2026-08-11', '2026-08-12 13:05:55'),
(175, 73, 46, 'present', 1, '2026-08-12', '2026-08-12 13:05:55'),
(176, 73, 51, 'present', 1, '2026-08-12', '2026-08-12 13:05:55'),
(177, 71, 46, 'absent', 1, '2026-08-13', '2026-08-13 05:22:30'),
(178, 71, 51, 'present', 1, '2026-08-13', '2026-08-13 05:22:30'),
(179, 71, 57, 'present', 1, '2026-08-13', '2026-08-13 05:22:30');

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

--
-- Dumping data for table `student_details`
--

INSERT INTO `student_details` (`id`, `studentId`, `birthplace`, `permanentAddress`, `religion`, `contactNumber`, `guardianName`, `guardianRelation`, `guardianContact`, `guardianOccupation`, `created_at`, `updated_at`) VALUES
(1, 67, 'Tacurong City', 'Brgy. Poblacion', 'Roman Catholic', '09171234567', 'Maria Garcia', 'Mother', '09179876543', 'Teacher', '2026-08-13 04:04:48', NULL);

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
(162, 57, 46, 18.00, '2026-08-12 13:05:55', NULL),
(163, 57, 51, 14.00, '2026-08-12 13:05:55', NULL),
(164, 58, 46, 26.00, '2026-08-12 13:05:55', NULL),
(165, 58, 51, 22.00, '2026-08-12 13:05:55', NULL),
(166, 59, 46, 27.00, '2026-08-12 13:05:55', NULL),
(167, 59, 51, 20.00, '2026-08-12 13:05:55', NULL),
(168, 60, 46, 28.00, '2026-08-12 13:05:55', NULL),
(169, 60, 51, 24.00, '2026-08-12 13:05:55', NULL),
(170, 61, 46, 45.00, '2026-08-12 13:05:55', NULL),
(171, 61, 51, 42.00, '2026-08-12 13:05:55', NULL),
(172, 62, 46, 17.00, '2026-08-12 13:05:55', NULL),
(173, 62, 51, 12.00, '2026-08-12 13:05:55', NULL),
(174, 63, 46, 27.00, '2026-08-12 13:05:55', NULL),
(175, 63, 51, 20.00, '2026-08-12 13:05:55', NULL),
(176, 64, 46, 28.00, '2026-08-12 13:05:55', NULL),
(177, 64, 51, 22.00, '2026-08-12 13:05:55', NULL),
(178, 65, 46, 44.00, '2026-08-12 13:05:55', NULL),
(179, 65, 51, 33.00, '2026-08-12 13:05:55', NULL),
(180, 66, 46, 17.00, '2026-08-12 13:05:55', NULL),
(181, 66, 51, 12.00, '2026-08-12 13:05:55', NULL),
(182, 67, 46, 27.00, '2026-08-12 13:05:55', NULL),
(183, 67, 51, 21.00, '2026-08-12 13:05:55', NULL),
(184, 54, 46, 27.00, '2026-08-13 05:29:37', NULL),
(185, 54, 51, 24.00, '2026-08-13 05:29:37', NULL),
(186, 54, 57, 0.00, '2026-08-13 05:29:37', NULL),
(187, 52, 46, 18.00, '2026-08-13 05:29:37', NULL),
(188, 52, 51, 15.00, '2026-08-13 05:29:37', NULL),
(189, 52, 57, 0.00, '2026-08-13 05:29:37', NULL),
(190, 53, 46, 19.00, '2026-08-13 05:29:37', NULL),
(191, 53, 51, 14.00, '2026-08-13 05:29:37', NULL),
(192, 53, 57, 0.00, '2026-08-13 05:29:37', NULL),
(193, 55, 46, 28.00, '2026-08-13 05:29:37', NULL),
(194, 55, 51, 22.00, '2026-08-13 05:29:37', NULL),
(195, 55, 57, 0.00, '2026-08-13 05:29:37', NULL),
(196, 56, 46, 46.00, '2026-08-13 05:29:37', NULL),
(197, 56, 51, 40.00, '2026-08-13 05:29:37', NULL),
(198, 56, 57, 0.00, '2026-08-13 05:29:37', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `subjects`
--

CREATE TABLE `subjects` (
  `id` int(11) NOT NULL,
  `name` varchar(20) NOT NULL,
  `code` text NOT NULL,
  `unit` decimal(10,0) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subjects`
--

INSERT INTO `subjects` (`id`, `name`, `code`, `unit`) VALUES
(53, 'Mathematics', 'MATH101', 3),
(54, 'English', 'ENG101', 3),
(55, 'Science', 'SCI101', 3),
(56, 'Filipino', 'FIL101', 3),
(57, 'Araling Panlipunan', 'AP101', 2),
(58, 'Values Education', 'VAL101', 2),
(59, 'MAPEH', 'MAPEH101', 2),
(60, 'Technology and Livel', 'TLE101', 2),
(61, 'Computer Science', 'CS101', 3),
(62, 'Science 2 - Chemistr', 'SCI201', 3),
(63, 'Mathematics 2 - Alge', 'MATH201', 3),
(64, 'English 2 - Literatu', 'ENG201', 3);

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
(48, 'juan.delacruz@gradesync.edu', 'Juan', 'M.', 'Dela cruz', NULL, 137),
(49, 'maria.santos@gradesync.edu', 'Maria', 'L.', 'Santos', NULL, 138),
(50, 'carlos.reyes@gradesync.edu', 'Carlos', 'R.', 'Reyes', 'Jr.', 139),
(51, 'ana.gonzales@gradesync.edu', 'Ana', 'P.', 'Gonzales', NULL, 140),
(52, 'pedro.ramos@gradesync.edu', 'Pedro', 'S.', 'Ramos', NULL, 141),
(53, 'luz.villanueva@gradesync.edu', 'Luz', 'T.', 'Villanueva', NULL, 142),
(54, 'miguel.angeles@gradesync.edu', 'Miguel', 'D.', 'Angeles', 'III', 143),
(55, 'rosa.lopez@gradesync.edu', 'Rosa', 'C.', 'Lopez', NULL, 144),
(56, 'antonio.flores@gradesync.edu', 'Antonio', 'B.', 'Flores', NULL, 145),
(57, 'elena.garcia@gradesync.edu', 'Elena', 'G.', 'Garcia', NULL, 146);

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
(134, 49, 54),
(135, 50, 54),
(136, 51, 55),
(137, 52, 56),
(138, 53, 57),
(139, 54, 58),
(140, 55, 59),
(141, 56, 60),
(142, 57, 61),
(143, 48, 61),
(144, 51, 62),
(145, 48, 63),
(146, 50, 64),
(148, 48, 53),
(150, 49, 53),
(151, 57, 63),
(152, 55, 63);

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
(136, 'admin@gradesync.edu', '$2b$10$zesHHcKl/v7HVnw9bwbjT.AQsjnrJAuxIorsgZrPzhVDgaOpHR2Hq', 'admin', 'active', '2026-08-12 13:05:55', NULL),
(137, 'juan.delacruz@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(138, 'maria.santos@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(139, 'carlos.reyes@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(140, 'ana.gonzales@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(141, 'pedro.ramos@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(142, 'luz.villanueva@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(143, 'miguel.angeles@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(144, 'rosa.lopez@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(145, 'antonio.flores@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(146, 'elena.garcia@gradesync.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'teacher', 'active', '2026-08-12 13:05:55', NULL),
(147, 'alex.updated@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(148, 'beatriz.mercado@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'inactive', '2026-08-12 13:05:55', NULL),
(149, 'carlo.mendoza@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(150, 'diana.lorenzo@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(151, 'eduardo.silva@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(152, 'francesca.cruz@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(153, 'gabriel.torres@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(154, 'hannah.aguilar@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(155, 'ivan.delossantos@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(156, 'jasmine.romero@student.edu', '$2b$10$N/x/.rQUGPy2gLOQlZOrIeH.F5SD6BUe9.F3/40amr/tsqCwdD01S', 'student', 'active', '2026-08-12 13:05:55', NULL),
(157, 'erwinlaysone97@gmail.com', '$2b$10$sVKvM9Ey2a169sCRr9s3Jej1mqPnygN.3m4VcR/vZM5jqTbJ1w6mO', 'student', 'active', '2026-08-12 13:15:22', NULL);

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
  ADD KEY `fk_assessments_classSubject` (`classSubjectId`);

--
-- Indexes for table `classrooms`
--
ALTER TABLE `classrooms`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_classroom_section` (`section`,`gradeLevel`);

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
-- Indexes for table `student_academic_record_subjects`
--
ALTER TABLE `student_academic_record_subjects`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_recordId` (`recordId`);

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `assessments`
--
ALTER TABLE `assessments`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=68;

--
-- AUTO_INCREMENT for table `classrooms`
--
ALTER TABLE `classrooms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=61;

--
-- AUTO_INCREMENT for table `class_students`
--
ALTER TABLE `class_students`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=58;

--
-- AUTO_INCREMENT for table `class_subjects`
--
ALTER TABLE `class_subjects`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=88;

--
-- AUTO_INCREMENT for table `class_teacher`
--
ALTER TABLE `class_teacher`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=64;

--
-- AUTO_INCREMENT for table `enrollments`
--
ALTER TABLE `enrollments`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=58;

--
-- AUTO_INCREMENT for table `enrollment_details`
--
ALTER TABLE `enrollment_details`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=117;

--
-- AUTO_INCREMENT for table `grading_weights`
--
ALTER TABLE `grading_weights`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `grading_weight_defaults`
--
ALTER TABLE `grading_weight_defaults`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `schoolyear`
--
ALTER TABLE `schoolyear`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=56;

--
-- AUTO_INCREMENT for table `school_info`
--
ALTER TABLE `school_info`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `students`
--
ALTER TABLE `students`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=80;

--
-- AUTO_INCREMENT for table `student_academic_records`
--
ALTER TABLE `student_academic_records`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `student_academic_record_subjects`
--
ALTER TABLE `student_academic_record_subjects`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `student_attendance`
--
ALTER TABLE `student_attendance`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=183;

--
-- AUTO_INCREMENT for table `student_details`
--
ALTER TABLE `student_details`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `student_scores`
--
ALTER TABLE `student_scores`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=199;

--
-- AUTO_INCREMENT for table `subjects`
--
ALTER TABLE `subjects`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=65;

--
-- AUTO_INCREMENT for table `teachers`
--
ALTER TABLE `teachers`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=58;

--
-- AUTO_INCREMENT for table `teacher_subject_assignment`
--
ALTER TABLE `teacher_subject_assignment`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=153;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=160;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `assessments`
--
ALTER TABLE `assessments`
  ADD CONSTRAINT `fk_assessments_classSubject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

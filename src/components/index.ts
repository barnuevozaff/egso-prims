/**
 * General Services Office Enterprise Component Library — public surface.
 * Feature code imports from "@/components"; the ui/ folder holds Radix
 * primitives that are consumed through these wrappers.
 */

// Buttons
export { Button, IconButton, buttonVariants } from "@/components/ui/button";

// Typography
export {
  PageTitle,
  SectionTitle,
  Subtitle,
  OverlineLabel,
  Caption,
  BodyText,
} from "@/components/typography/typography";

// Cards
export { ContainerCard } from "@/components/cards/container-card";
export { InformationCard } from "@/components/cards/information-card";
export { MetricCard } from "@/components/cards/metric-card";
export { MetricIcon, type MetricTone } from "@/components/cards/metric-icon";
export { SummaryCard } from "@/components/cards/summary-card";

// Layout
export { AppShell, PageHeader } from "@/components/layout/app-shell";
export { CardCarousel } from "@/components/layout/card-carousel";
export { PageTransition } from "@/components/layout/page-transition";

// Navigation
export {
  Sidebar,
  SidebarBrand,
  SidebarContent,
  SidebarGroup,
  SidebarDivider,
  SidebarItem,
  SidebarFooter,
} from "@/components/navigation/sidebar";
export { SidebarUser } from "@/components/navigation/sidebar-user";
export { Breadcrumb, type BreadcrumbItem } from "@/components/navigation/breadcrumb";
export { Stepper, type StepperStep } from "@/components/navigation/stepper";
export { TopBar, NotificationBell } from "@/components/navigation/top-bar";
export { ProfileMenu } from "@/components/navigation/profile-menu";
export { OfficeSwitcher } from "@/components/navigation/office-switcher";

// Tables
export {
  EnterpriseTable,
  TableCard,
  TablePagination,
  type EnterpriseColumnMeta,
} from "@/components/table/enterprise-table";
export {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/table/table-primitives";

// Toolbar
export { SearchBar } from "@/components/toolbar/search-bar";
export { FilterBar } from "@/components/toolbar/filter-bar";
export { StatusTabs, type StatusTab } from "@/components/toolbar/status-tabs";
export { DropdownFilter } from "@/components/toolbar/dropdown-filter";
export { DateFilter } from "@/components/toolbar/date-filter";
export { ExportButton, PrintButton } from "@/components/toolbar/toolbar-buttons";

// Status
export {
  StatusBadge,
  PriorityBadge,
  ApprovalBadge,
  NotificationBadge,
  type DocumentStatus,
  type Priority,
  type ApprovalState,
} from "@/components/status/badges";

// Drawer
export {
  Drawer,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerActions,
} from "@/components/drawer/drawer";

// Modals
export {
  ConfirmationModal,
  DeleteModal,
  SuccessModal,
  WarningModal,
} from "@/components/modal/modals";

// Forms
export { Field } from "@/components/forms/field";
export { Input, Textarea } from "@/components/forms/input";
export { SelectField } from "@/components/forms/select-field";
export { Combobox } from "@/components/forms/combobox";
export { DatePicker } from "@/components/forms/date-picker";
export { FileUpload, DragDropUpload } from "@/components/forms/file-upload";
export { Checkbox } from "@/components/ui/checkbox";
export { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
export { Switch } from "@/components/ui/switch";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Feedback
export { Toaster, toast } from "@/components/feedback/toaster";
export { Spinner } from "@/components/feedback/spinner";
export { PageFallback } from "@/components/feedback/page-fallback";
export { RouteError } from "@/components/feedback/route-error";
export { Skeleton, SkeletonText } from "@/components/feedback/skeleton";
export { ProgressBar } from "@/components/feedback/progress-bar";
export { EmptyState, ErrorState, SuccessState } from "@/components/feedback/states";

// Timeline
export {
  ActivityTimeline,
  HistoryTimeline,
  ApprovalTimeline,
  type ActivityTimelineItem,
  type HistoryTimelineItem,
  type ApprovalTimelineStep,
} from "@/components/timeline/timeline";

// Calendar
export { MonthlyCalendar } from "@/components/calendar/monthly-calendar";
export { ScheduleCard, ReservationEvent } from "@/components/calendar/schedule";

// Charts
export { ChartCanvas } from "@/components/charts/chart-canvas";
export {
  ChartCard,
  DonutChartContainer,
  BarChartContainer,
  LineChartContainer,
  chartPalette,
} from "@/components/charts/chart-containers";

// Utilities
export { Avatar } from "@/components/utilities/avatar";
export {
  CurrencyDisplay,
  DocumentNumber,
  DepartmentChip,
  InfoChip,
} from "@/components/utilities/display";
export { NotificationCard } from "@/components/utilities/notification-card";

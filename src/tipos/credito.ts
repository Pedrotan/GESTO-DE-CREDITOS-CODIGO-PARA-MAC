export interface ClientDocument {
  id: string;
  title: string;
  type: 'pdf' | 'image';
  data: string; // Base64 (imagem ou PDF)
  createdAt: Date;
}

export interface BankCoordinate {
  id: string;
  bankName: string;
  iban: string;
  holder: string;
}

export interface Client {
  id: string;
  name: string;
  nif: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  monthlyIncome?: number;
  defaultInterestRate: number;
  lateInterestRate: number;
  toleranceDays: number;
  status: 'active' | 'blocked' | 'inactive';
  riskLevel: 'low' | 'medium' | 'high';
  whatsappVerified?: boolean;
  documents: ClientDocument[];
  bankCoordinates: BankCoordinate[];
  receiveMethod: 'transfer' | 'cash';
  birthDate?: string;
  age?: number;
  issueDate?: string;
  expiryDate?: string;
  gender?: string;
  maritalStatus?: string;
  // Tipo de titular: pessoa singular ou pessoa colectiva (empresa)
  clientType?: 'PARTICULAR' | 'EMPRESA';
  // Carteira a que o cliente pertence. Ausente = cliente comum (registos antigos).
  clientCategory?: 'COMUM' | 'APOSENTADO' | 'ESTRANGEIRO';
  // --- Identificação do documento (nacional ou estrangeiro) ---
  /** Documento usado na identificação. Ausente = BI (registos anteriores). */
  documentType?: 'BI' | 'PASSAPORTE';
  /** Código ISO 3166-1 alpha-2 do país emissor, ex.: "AO". */
  countryCode?: string;
  /** Gentílico, pré-preenchido pelo país mas editável. */
  nationality?: string;
  /** true apenas quando a validação de formato angolana foi aplicada e passou. */
  passportFormatValidated?: boolean;
  // Dados do cônjuge. Em Angola, casados em comunhão de bens respondem
  // solidariamente pela dívida, por isso a identificação do cônjuge é
  // recolhida junto com a do titular.
  spouseName?: string;
  spouseBi?: string;
  spouseNif?: string;
  spousePhone?: string;
  spouseEmail?: string;
  // Campos exclusivos de pessoa colectiva
  foundationDate?: string;
  legalForm?: string;
  businessSector?: string;
  commercialRegistry?: string;
  legalRepresentative?: string;
  legalRepRole?: string;
  fatherName?: string;
  motherName?: string;
  // Campos exclusivos da carteira de Aposentados
  /** Instituição/entidade onde o aposentado trabalhou antes da reforma. */
  workInstitution?: string;
  /** Número de Segurança Social do aposentado. */
  socialSecurityNumber?: string;
  creditScore?: number;
  lastContacted?: Date;
  blocked?: boolean;
  blockReason?: string;
  blockedAt?: string;
  blockedBy?: string;
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  restoredAt?: Date;
  originalState?: string;
  usuario_id?: string;
}

export interface Credit {
  id: string;
  clientId: string;
  clientName: string;
  principalAmount: number;
  principalAmountMinor?: number;
  currentBalance: number;
  currentBalanceMinor?: number;
  interestRate: number;
  lateInterestRate: number;
  installments: number;
  paidInstallments: number;
  startDate: Date;
  dueDate: Date;
  nextDueDate?: Date;
  status: 'active' | 'overdue' | 'paid' | 'renegotiated' | 'defaulted' | 'pending_approval' | 'rejected' | 'cancelled';
  requestedBy?: string;
  requestedAt?: Date;
  approvedBy?: string;
  approvalNotes?: string;
  daysOverdue: number;
  accruedInterest: number;
  accruedInterestMinor?: number;
  lateInterest: number;
  lateInterestMinor?: number;
  totalDue: number;
  totalDueMinor?: number;
  version?: number;
  amortizationMethod?: 'PRICE' | 'SAC' | 'FLAT';
  creditNumber?: number; // Cycle: 1st, 2nd, etc.
  paidAt?: Date | string;
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  restoredAt?: Date;
  originalState?: string;
  usuario_id?: string;
  targetMonthId?: string;
  supplierId?: string;
  supplierProfitRate?: number;
  /** Total de capital acrescentado por reforços. */
  reinforcedAmount?: number;
}

/**
 * Reforço de capital: acréscimo a um crédito já em curso.
 * Distingue-se de uma renegociação — o contrato mantém-se, o capital é que
 * aumenta, e o valor reforçado gera juros à mesma taxa do crédito original.
 */
export interface CreditReinforcement {
  id: string;
  creditId: string;
  clientId: string;
  clientName: string;
  /** Capital acrescentado ao contrato. */
  amount: number;
  amountMinor?: number;
  /** Taxa aplicada ao reforço (por omissão, a do crédito). */
  interestRate: number;
  /** Juros gerados só pelo reforço. */
  interestAmount: number;
  /** Capital do crédito antes e depois do reforço, para rastreio. */
  principalBefore: number;
  principalAfter: number;
  date: Date | string;
  notes?: string;
  createdBy?: string;
  createdAt: Date | string;
  usuario_id?: string;
}

export interface Payment {
  id: string;
  creditId: string;
  clientName: string;
  amount: number;
  allocatedToLateInterest: number;
  allocatedToLateInterestMinor?: number;
  allocatedToInterest: number;
  allocatedToInterestMinor?: number;
  allocatedToPrincipal: number;
  allocatedToPrincipalMinor?: number;
  idempotencyKey?: string;
  /** Pedido transitório: liquida sempre as N prestações mais antigas em aberto. */
  installmentCount?: number;
  method: 'cash' | 'transfer' | 'reference';
  reference?: string;
  paymentDate: Date;
  dueDate?: Date;
  processedBy: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  deletedAt?: Date;
  deletedBy?: string;
  restoredAt?: Date;
  originalState?: string;
  usuario_id?: string;
}

export interface DashboardMetrics {
  globalPlafond: number;
  usedPlafond: number;
  availablePlafond: number;
  totalRevenue: number;
  interestRevenue: number;
  lateInterestRevenue: number;
  activeCredits: number;
  overdueCredits: number;
  paidCredits: number;
  totalClients: number;
  activeClients: number;
  defaultedAmount: number;
}

export interface ChartDataPoint {
  name: string;
  [key: string]: string | number;
}

export interface PieChartData {
  name: string;
  value: number;
  fill: string;
}


export interface Contract {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  startDate: Date;
  endDate: Date;
  value: number;
  status: 'active' | 'expired' | 'terminated' | 'draft' | 'paid';
  terms?: string;
  documentUrl?: string;
  clientNif?: string;
  receiveMethod?: 'transfer' | 'cash';
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  restoredAt?: Date;
  originalState?: string;
  usuario_id?: string;
}

export interface Notification {
  id: string;
  userId?: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  source?: 'system' | 'chat';
  read: boolean;
  timestamp: Date;
}

export interface AgingData {
  name: string;
  value: number;
  amount: number;
}

export interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'login_failure';
  entity: 'client' | 'credit' | 'payment' | 'user' | 'system' | 'contencioso' | 'garantia' | 'payment_gateway';
  entityId?: string;
  details: string;
  userId: string;
  userName: string;
  timestamp: Date;
  previousState?: string; // JSON string
  newState?: string;     // JSON string
  metadata?: string;     // JSON string (IP, UserAgent, Reason, references)
}

export interface MessageTemplate {
  id: string;
  name: string;
  type: string;
  content: string;
  isDefault: number | boolean;
}

export interface UserLimit {
  id: string;
  userId?: string;
  role: 'admin' | 'manager';
  maxTransaction: number;
  dailyLimit: number;
  monthlyLimit: number;
  restrictionsEnabled: boolean;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string;
  timestamp: Date;
  read: boolean;
}

export interface Simulation {
  id: string;
  reference: string;
  date: Date | string;
  clientName: string;
  clientIncome: number;
  amount: number;
  term: number;
  interestRate: number;
  method: 'price' | 'sac';
  riskProfile: 'low' | 'medium' | 'high';
  totalPayment: number;
  monthlyPayment: number;
  aiAnalysis?: string;
  usuario_id?: string;
  createdAt: Date | string;
}

export type AccountingAccount = 'cash' | 'bank' | 'portfolio' | 'receivable_interest' | 'receivable_late_interest' | 'revenue_interest' | 'revenue_late_interest' | 'equity' | 'provision' | 'expenses' | 'capital' | 'pdd';

export interface AccountingEntry {
  id: string;
  timestamp: Date;
  type: 'disbursement' | 'payment' | 'interest_accrual' | 'late_interest' | 'adjustment' | 'reversal';
  description: string;
  clientId?: string;
  creditId?: string;
  paymentId?: string;
  debit: AccountingAccount;
  credit: AccountingAccount;
  amountPrincipal: number;
  amountInterest: number;
  amountLateInterest: number;
  amountTotal: number;
  amountPrincipalMinor?: number;
  amountInterestMinor?: number;
  amountLateInterestMinor?: number;
  amountTotalMinor?: number;
  processedBy: string;
  justification?: string;
  integrityHash: string;
  previousHash: string;
  hashVersion?: number;
  ledgerSequence?: number;
  usuario_id?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  nif?: string;
  address?: string;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  usuario_id?: string;
}

export interface CalendarTask {
  id: string;
  title: string;
  description?: string;
  date: string; // 'YYYY-MM-DD'
  done: boolean;
  createdAt: Date;
  usuario_id?: string;
}

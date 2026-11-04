import {runRecoveryJobs} from './engagement/recovery-worker';
import {runPaymentJobs} from './payments';import {runNotificationJobs} from './operations';
export async function processBackgroundJobs(orderId?:string){await runPaymentJobs(orderId);const notifications=await runNotificationJobs(orderId);if(!orderId)await runRecoveryJobs();return notifications;}

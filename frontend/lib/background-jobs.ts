import {runMenuSync} from './menu-sync';
import {runRecoveryJobs} from './engagement/recovery-worker';
import {runPaymentJobs} from './payments';import {runNotificationJobs} from './operations';
import {runCloverJobs} from './clover';
export async function processBackgroundJobs(orderId?:string){await runPaymentJobs(orderId);const clover=await runCloverJobs(orderId);const notifications=await runNotificationJobs(orderId);if(!orderId){await runRecoveryJobs();await runMenuSync();}return {...notifications,clover};}

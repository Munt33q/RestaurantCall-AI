import {cookies} from 'next/headers';
import {verifyStaffSession} from './staff-session';
export function staffAuthorized(){return verifyStaffSession(cookies().get('staff_session')?.value);}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}

import { redirect } from 'next/navigation';

/** The platform console moved into the Control Tower (landlord's dark room). */
export default function AdminRedirect() {
  redirect('/tower');
}

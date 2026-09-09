import { query } from '../lib/db.js';
import { requireOwner } from '../lib/auth.js';
import { logServerError } from '../lib/errors.js';
import { json } from '../lib/response.js';
import { AdminError, adminFailure, queryId } from '../lib/admin-validation.js';
export function createAdminPromotionHandler(runQuery=query,env=process.env,log=logServerError){return async event=>{if(event.httpMethod!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});try{const owner=await requireOwner(event,runQuery,env);const id=queryId(event,'promotion_id');if(!id)throw new AdminError(400,'VALIDATION_ERROR');const [promotion]=await runQuery('SELECT id::text AS id,title,description,image_url,price::text AS price,starts_at,ends_at,active,sort_order FROM promotions WHERE id=$1 AND business_id=$2',[id,owner.business_id]);if(!promotion)throw new AdminError(404,'PROMOTION_NOT_FOUND');return json({ok:true,promotion})}catch(error){return adminFailure(error,'admin.promotion',log)}}}
export const handler=createAdminPromotionHandler();

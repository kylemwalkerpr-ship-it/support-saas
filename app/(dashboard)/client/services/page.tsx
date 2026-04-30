import { Clock, CheckCircle, ShoppingCart } from 'lucide-react'
import { Header } from '@/components/dashboard/header'
import { getServices } from '@/lib/actions/services'
import { formatCurrency } from '@/lib/utils'
import { AddToCartButton } from './add-to-cart-button'
import { getOrCreateCart } from '@/lib/actions/orders'

export default async function ServicesPage() {
  const [services, cart] = await Promise.all([
    getServices(),
    getOrCreateCart(),
  ])

  const cartServiceIds = new Set(
    cart.items?.map((item) => item.service_id) ?? []
  )

  return (
    <div>
      <Header
        title="Services"
        subtitle="Browse our consultancy packages and add them to your order"
      />
      <div className="p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Category pill */}
              <div className="px-6 pt-5 pb-0">
                <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {service.category}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {service.title}
                </h3>
                <p className="text-sm text-gray-500 mb-4 flex-1 leading-relaxed">
                  {service.description}
                </p>

                {/* Features */}
                {service.features.length > 0 && (
                  <ul className="space-y-1.5 mb-5">
                    {service.features.slice(0, 4).map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(service.price)}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {service.delivery_days} day delivery
                    </div>
                  </div>
                  <AddToCartButton
                    serviceId={service.id}
                    isInCart={cartServiceIds.has(service.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

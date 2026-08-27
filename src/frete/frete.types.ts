export interface FreteProduto {
  productId: number;
  name: string;
  quantity: number;
  unitValue: number;
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export interface FreteCotacaoInput {
  originZipCode: string;
  destinationZipCode: string;
  items: FreteProduto[];
}

export interface FreteOption {
  serviceId: string;
  serviceName: string;
  companyName: string;
  companyPicture?: string;
  price: number;
  deliveryTime: number;
}

import express from 'express'
import cors from "cors"
import 'dotenv/config'
import {MongoClient, ServerApiVersion} from 'mongodb'
const port = process.env.PORT || 5000
const app = express() 

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@doctors-portal.yfumd.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

async function run(){
    try{
        await client.connect()

        const servicesCollection = client.db("doctors_portal").collection("services")
        const bookingCollection = client.db("doctors_portal").collection("booking")

        // services API 

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
        })

        // booking API 
        
        app.post('/booking', async(req, res) => {
            const booking = req.body
            const query = {treatment: booking.treatment, patientEmail: booking.patientEmail, date: booking.date}
            const exists = await  bookingCollection.findOne(query)
            if(exists) return res.send({success: false, booking: exists})
            const result = await bookingCollection.insertOne(booking)
            res.send({success: true, result})
        })

        app.get('/booking', async(req, res) => {
            const patientEmail = req.query.email
            const query = {patientEmail: patientEmail}
            const result = await bookingCollection.find(query).toArray()
            res.send(result)
        })

        // availbale appointments API 

        app.get('/available', async(req, res) => {
            const services = await servicesCollection.find().toArray()
            const query = {date: req.query.date}
            const bookings = await bookingCollection.find(query).toArray()
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name)
                const booked = serviceBooking.map(s => s.slot) 
                service.booked = booked;
                const availbale = service.slots.filter(s => !booked.includes(s))
                service.slots = availbale
            })

            res.send(services)
        })

    }
    finally{

    }
}

run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello form doctors portal')
})

app.listen(port, () => {
    console.log(port)
})


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

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
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

